import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw =
    process.env.CALENDAR_TOKEN_KEY ??
    process.env.SESSION_SECRET ??
    "";
  if (!raw) {
    throw new Error(
      "CALENDAR_TOKEN_KEY (or SESSION_SECRET as fallback) must be set to encrypt calendar tokens.",
    );
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptToken(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

export function decryptToken(payload: string): string {
  if (!payload) return "";
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token payload");
  }
  const [ivB64, tagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
