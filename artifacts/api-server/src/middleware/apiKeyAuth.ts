import type { Request, Response, NextFunction } from "express";
import { db, orgApiKeysTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { hashApiKey, isValidApiKeyFormat } from "../lib/orgApiKey.js";

export interface ApiKeyRequest extends Request {
  apiKey?: {
    id: string;
    orgId: string;
    label: string;
    scopes: string[];
  };
}

/**
 * Authenticate a request using an `Authorization: Bearer <key>` header.
 * Updates `lastUsedAt` on success. The middleware lazily looks up the key
 * row; for rate-limiting use `apiKeyRateLimit` after this middleware.
 */
export async function authenticateApiKey(req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> {
  const auth = req.header("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m) {
    res.status(401).json({ error: "Missing or malformed Authorization header. Use 'Authorization: Bearer mi_orgk_…'." });
    return;
  }
  const rawKey = m[1]!.trim();
  if (!isValidApiKeyFormat(rawKey)) {
    res.status(401).json({ error: "Invalid API key format." });
    return;
  }
  const keyHash = hashApiKey(rawKey);

  const row = await db.query.orgApiKeysTable.findFirst({
    where: and(eq(orgApiKeysTable.keyHash, keyHash), isNull(orgApiKeysTable.revokedAt)),
  });

  if (!row) {
    res.status(401).json({ error: "Invalid or revoked API key." });
    return;
  }

  req.apiKey = {
    id: row.id,
    orgId: row.orgId,
    label: row.label,
    scopes: row.scopes,
  };

  // Best-effort lastUsedAt update (don't block the request on it).
  db.update(orgApiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(orgApiKeysTable.id, row.id))
    .catch(err => console.error("[apiKeyAuth] failed to update lastUsedAt:", err));

  next();
}

/**
 * Require the authenticated API key to hold a given scope.
 */
export function requireScope(scope: string) {
  return function scopeMiddleware(req: ApiKeyRequest, res: Response, next: NextFunction) {
    if (!req.apiKey) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    if (!req.apiKey.scopes.includes(scope)) {
      res.status(403).json({ error: `API key is missing required scope '${scope}'.` });
      return;
    }
    next();
  };
}

interface KeyBucket { count: number; resetAt: number }

const KEY_BUCKETS = new Map<string, KeyBucket>();

/**
 * Per-API-key rate limiter. Uses an in-memory token bucket keyed by the
 * authenticated key id. 120 requests per minute per key by default.
 */
export function createApiKeyRateLimiter(opts?: { windowMs?: number; max?: number }) {
  const windowMs = opts?.windowMs ?? 60 * 1000;
  const max = opts?.max ?? 120;

  return function apiKeyRateLimit(req: ApiKeyRequest, res: Response, next: NextFunction) {
    const id = req.apiKey?.id;
    if (!id) {
      // Without a key, fall back to the global IP-based limiter that wraps
      // /api in app.ts.
      next();
      return;
    }
    const now = Date.now();
    let bucket = KEY_BUCKETS.get(id);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      KEY_BUCKETS.set(id, bucket);
    }
    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.floor(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: "API rate limit exceeded for this key. Please slow down." });
      return;
    }
    next();
  };
}
