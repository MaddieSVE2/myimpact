/**
 * Shared helpers for the database backup scripts (backup-db.ts and
 * backup-prod-db.ts). Centralised so both scripts use the same
 * App Storage client configuration, path parsing, and human-readable
 * formatting — there is one source of truth for how a backup is
 * uploaded and reported.
 */
import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const storage = new Storage({
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

export function parseObjectStorageDir(privateDir: string): {
  bucket: string;
  prefix: string;
} {
  const trimmed = privateDir.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("PRIVATE_OBJECT_DIR is empty after trimming.");
  }
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    throw new Error(
      `PRIVATE_OBJECT_DIR "${privateDir}" must be of the form "/<bucket>/<prefix>" ` +
        `(e.g. "/replit-objstore-xxx/.private"). Got no "/" inside the value.`,
    );
  }
  const bucket = trimmed.slice(0, slash);
  const prefix = trimmed.slice(slash + 1);
  if (!bucket || !prefix) {
    throw new Error(
      `PRIVATE_OBJECT_DIR "${privateDir}" must include both a bucket and a prefix.`,
    );
  }
  return { bucket, prefix };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function utcTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}
