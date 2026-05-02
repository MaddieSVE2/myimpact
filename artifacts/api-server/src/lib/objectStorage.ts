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
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
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

function resolveFile(storageKey: string): File {
  const dir = getPrivateObjectDir();
  const fullPath = `${dir.replace(/\/$/, "")}/${storageKey}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

export async function getUploadURL(storageKey: string, contentType: string): Promise<string> {
  const dir = getPrivateObjectDir();
  const fullPath = `${dir.replace(/\/$/, "")}/${storageKey}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
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

// Re-exports kept for completeness (some other code may import these)
export { Readable };
