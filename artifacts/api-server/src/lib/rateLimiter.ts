import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Creates an Express middleware that enforces a per-IP rate limit.
 * Uses req.ip which respects the "trust proxy" setting in app.ts to prevent
 * X-Forwarded-For spoofing.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, max, message = "Too many requests. Please try again later." } = options;
  const store = new Map<string, RateLimitEntry>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
  }, windowMs);

  if (cleanup.unref) {
    cleanup.unref();
  }

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    // E2E test mode: the whole Playwright suite hammers the API from a single
    // IP (localhost), so per-IP limits trip constantly and fail tests with
    // spurious 429s. Test mode is never enabled in production.
    if (process.env.E2E_TEST_MODE === "1") {
      next();
      return;
    }
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
