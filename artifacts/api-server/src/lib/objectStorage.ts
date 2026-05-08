import { Storage, type File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  return dir;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const p = path.startsWith("/") ? path : `/${path}`;
  const parts = p.split("/");
  if (parts.length < 3) throw new Error("Invalid object path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
  contentType,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
  contentType?: string;
}): Promise<string> {
  const body: Record<string, unknown> = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  if (contentType) {
    body.content_type = contentType;
  }
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }
  const data = (await response.json()) as { signed_url: string };
  return data.signed_url;
}

/**
 * Build a per-user storage key for an attachment.
 * Layout: <PRIVATE_OBJECT_DIR>/attachments/<userId>/<uuid>
 * Returns just the storageKey (without the private dir prefix) so it
 * can be safely stored in the DB and re-resolved later.
 */
export function generateAttachmentKey(userId: string): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `attachments/${safeUserId}/${randomUUID()}`;
}

/**
 * Build a per-org storage key for an uploaded brand logo.
 * Layout: <PRIVATE_OBJECT_DIR>/org-logos/<orgId>/<uuid>
 * Uses a UUID suffix so each upload is a fresh object — old keys can be
 * deleted explicitly when replaced.
 */
export function generateOrgLogoKey(orgId: string): string {
  const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `org-logos/${safeOrgId}/${randomUUID()}`;
}

/**
 * Read the bytes of a stored object into memory. Used when we need to embed
 * the object inline (e.g. an org logo into a server-rendered PDF).
 * Returns null if the object does not exist.
 */
export async function readObjectBuffer(storageKey: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const file = resolveFile(storageKey);
  try {
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();
    return {
      buffer,
      contentType: (metadata.contentType as string) || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

function resolveFile(storageKey: string): File {
  const dir = getPrivateObjectDir();
  const fullPath = `${dir.replace(/\/$/, "")}/${storageKey}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

/**
 * Generate a signed PUT URL for an attachment upload.
 * - contentType is bound so GCS rejects PUTs with a mismatched Content-Type.
 * - maxBytes is passed as a best-effort upper bound on content length;
 *   the Replit sidecar will include it in the signed URL if supported.
 */
export async function getUploadURL(
  storageKey: string,
  contentType: string,
  maxBytes?: number,
): Promise<string> {
  const dir = getPrivateObjectDir();
  const fullPath = `${dir.replace(/\/$/, "")}/${storageKey}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const body: Record<string, unknown> = {
    bucket_name: bucketName,
    object_name: objectName,
    method: "PUT" as const,
    expires_at: new Date(Date.now() + 900 * 1000).toISOString(),
    content_type: contentType,
  };
  if (maxBytes != null) {
    body.max_bytes = maxBytes;
  }
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }
  const data = (await response.json()) as { signed_url: string };
  return data.signed_url;
}

export async function getDownloadURL(storageKey: string): Promise<string> {
  const dir = getPrivateObjectDir();
  const fullPath = `${dir.replace(/\/$/, "")}/${storageKey}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return signObjectURL({ bucketName, objectName, method: "GET", ttlSec: 3600 });
}

export async function deleteAttachment(storageKey: string): Promise<void> {
  const file = resolveFile(storageKey);
  try {
    await file.delete({ ignoreNotFound: true });
  } catch {
    // best-effort delete
  }
}

/**
 * Fetch the actual content-type and byte size of an already-uploaded object
 * directly from GCS — never trust client-supplied values for these.
 * Returns null if the object does not exist or metadata cannot be read.
 */
export async function getObjectMetadata(
  storageKey: string,
): Promise<{ contentType: string; size: number } | null> {
  const file = resolveFile(storageKey);
  try {
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    return {
      contentType: (metadata.contentType as string) || "application/octet-stream",
      size: metadata.size != null ? Number(metadata.size) : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Delete any objects in the user's attachment prefix that are NOT recorded in
 * `registeredKeys` and were created more than `maxAgeMs` ago.
 *
 * This garbage-collects objects that were uploaded via a signed URL but were
 * never registered (e.g. the client uploaded a file and then skipped the
 * /register call). Unregistered objects are invisible to the quota calculator
 * and bypass storage controls unless cleaned up here.
 *
 * Call this before issuing a new signed upload URL so that orphaned objects
 * don't accumulate silently.
 */
export async function purgeUnregisteredAttachments(
  userId: string,
  registeredKeys: Set<string>,
  maxAgeMs = 15 * 60 * 1000,
): Promise<void> {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = getPrivateObjectDir();
  const fullPrefix = `${dir.replace(/\/$/, "")}/attachments/${safeUserId}/`;
  const { bucketName, objectName: objectPrefix } = parseObjectPath(fullPrefix);

  try {
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: objectPrefix });

    const cutoff = Date.now() - maxAgeMs;
    for (const file of files) {
      const objectName = file.name;
      const storageKey = `attachments/${safeUserId}/${objectName.slice(objectPrefix.length)}`;

      if (registeredKeys.has(storageKey)) continue;

      const created = file.metadata.timeCreated
        ? new Date(file.metadata.timeCreated as string).getTime()
        : 0;
      if (created > cutoff) continue;

      await file.delete({ ignoreNotFound: true }).catch(() => {});
    }
  } catch {
    // best-effort: listing or deletion errors must not block the upload flow
  }
}

/**
 * Sum the actual storage bytes consumed by ALL objects in the user's GCS
 * attachment prefix — including unregistered (orphaned) objects.
 *
 * This provides an authoritative storage quota figure independent of the DB,
 * closing the window where unregistered uploads inflate storage usage without
 * being reflected in the DB-row-based quota sum.
 *
 * Returns 0 on any error (GCS listing failure must not block uploads).
 */
export async function getUserPrefixBytes(userId: string): Promise<number> {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = getPrivateObjectDir();
  const fullPrefix = `${dir.replace(/\/$/, "")}/attachments/${safeUserId}/`;
  const { bucketName, objectName: objectPrefix } = parseObjectPath(fullPrefix);
  try {
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: objectPrefix });
    let total = 0;
    for (const file of files) {
      total += file.metadata.size != null ? Number(file.metadata.size) : 0;
    }
    return total;
  } catch {
    return 0;
  }
}

export async function streamAttachment(storageKey: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string; contentLength?: string } | null> {
  const file = resolveFile(storageKey);
  try {
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    return {
      stream: file.createReadStream(),
      contentType: (metadata.contentType as string) || "application/octet-stream",
      contentLength: metadata.size != null ? String(metadata.size) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Sweep ALL user attachment prefixes and delete any unregistered objects
 * older than `maxAgeMs`. This is the server-side scheduled GC that operates
 * independent of user activity.
 *
 * `registeredKeysByUser` maps safeUserId → Set<storageKey> of DB-registered keys.
 * Objects whose storageKey is not in the set for their owner are treated as
 * orphans. Objects younger than maxAgeMs are left in place (active upload window).
 *
 * Returns the number of objects deleted.
 */
export async function sweepOrphanedAttachments(
  registeredKeysByUser: Map<string, Set<string>>,
  maxAgeMs = 15 * 60 * 1000,
): Promise<number> {
  const dir = getPrivateObjectDir();
  const attachmentsPrefix = `${dir.replace(/\/$/, "")}/attachments/`;
  const { bucketName, objectName: objectPrefix } = parseObjectPath(attachmentsPrefix);

  let deleted = 0;
  try {
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: objectPrefix });

    const cutoff = Date.now() - maxAgeMs;
    for (const file of files) {
      // objectName looks like: <objectPrefix><safeUserId>/<uuid>
      const relativePath = file.name.slice(objectPrefix.length);
      const slashIdx = relativePath.indexOf("/");
      if (slashIdx === -1) continue;

      const safeUserId = relativePath.slice(0, slashIdx);
      const storageKey = `attachments/${safeUserId}/${relativePath.slice(slashIdx + 1)}`;

      const userKeys = registeredKeysByUser.get(safeUserId);
      if (userKeys?.has(storageKey)) continue;

      const created = file.metadata.timeCreated
        ? new Date(file.metadata.timeCreated as string).getTime()
        : 0;
      if (created > cutoff) continue;

      await file.delete({ ignoreNotFound: true }).catch(() => {});
      deleted++;
    }
  } catch {
    // best-effort: GC errors must not crash the server
  }
  return deleted;
}

// Re-exports kept for completeness (some other code may import these)
export { Readable };
