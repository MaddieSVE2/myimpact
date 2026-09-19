import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const INTERNAL_SSR_HEADER = "x-my-impact-ssr-token";

export function isTrustedInternalSsrRequest(req: Request): boolean {
  const secret = process.env.SESSION_SECRET;
  const supplied = req.get(INTERNAL_SSR_HEADER);
  if (!secret || !supplied) return false;

  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}