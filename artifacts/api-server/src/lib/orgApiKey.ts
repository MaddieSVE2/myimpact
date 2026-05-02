import { createHash, randomBytes } from "crypto";

/**
 * Org API key format: `mi_orgk_<24 url-safe random chars>`. The body of the
 * key is generated from 18 random bytes encoded as base64url (24 chars). The
 * raw key is shown to the user once at creation time and never persisted —
 * only the sha256 of the raw key is stored.
 */
const KEY_PREFIX = "mi_orgk_";
const RAW_BYTES = 18;

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const body = randomBytes(RAW_BYTES).toString("base64url");
  const rawKey = `${KEY_PREFIX}${body}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  // Show enough of the body in the UI to be recognisable but not enough to
  // reconstruct the key (8 chars of 24).
  const keyPrefix = `${KEY_PREFIX}${body.slice(0, 8)}`;
  return { rawKey, keyHash, keyPrefix };
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function isValidApiKeyFormat(rawKey: string): boolean {
  return typeof rawKey === "string" && rawKey.startsWith(KEY_PREFIX) && rawKey.length === KEY_PREFIX.length + 24;
}
