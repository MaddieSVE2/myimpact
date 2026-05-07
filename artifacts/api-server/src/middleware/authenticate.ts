import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Sentry, isSentryEnabled } from "../lib/sentry.js";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

function tagSentryUser(userId: string | null) {
  if (!isSentryEnabled()) return;
  Sentry.getCurrentScope().setUser(userId ? { id: userId } : null);
}

/**
 * GDPR/security: tiny in-process LRU of "we just verified this user id
 * still exists" so we don't pay a DB round-trip on every authenticated
 * request. Entries expire after USER_EXISTS_TTL_MS so that account
 * deletion invalidates any lingering sessions within seconds.
 */
const USER_EXISTS_TTL_MS = 10_000;
const userExistsCache = new Map<string, number>();
/** Called from the account-deletion path so the next request from the
 *  deleted user's other tabs/devices fails the existence check immediately
 *  rather than waiting for the TTL to lapse. */
export function invalidateUserExistsCache(userId: string): void {
  userExistsCache.delete(userId);
}
async function userStillExists(userId: string): Promise<boolean> {
  const now = Date.now();
  const checkedAt = userExistsCache.get(userId);
  if (checkedAt && now - checkedAt < USER_EXISTS_TTL_MS) return true;
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!row) {
    userExistsCache.delete(userId);
    return false;
  }
  userExistsCache.set(userId, now);
  return true;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.mi_session;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let payload: { id: string; email: string };
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET not set");
    payload = jwt.verify(token, secret) as { id: string; email: string };
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  // Token is cryptographically valid, but the user row may have been
  // deleted (right-to-erasure). Reject the request and clear the cookie
  // so the client knows to re-authenticate.
  try {
    if (!(await userStillExists(payload.id))) {
      res.clearCookie("mi_session", { path: "/", secure: true, sameSite: "lax" });
      res.status(401).json({ error: "Account no longer exists" });
      return;
    }
  } catch (err) {
    console.error("[authenticate] user-existence check failed", err);
    res.status(503).json({ error: "Auth check temporarily unavailable" });
    return;
  }

  req.user = { id: payload.id, email: payload.email };
  tagSentryUser(payload.id);
  next();
}

/**
 * Best-effort session decode for endpoints that don't require auth (e.g.
 * the analytics ingest endpoint, which needs to fire for guests too but
 * should still attach the user id when one is present).
 */
export function decodeSessionCookie(req: Request): string | null {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.mi_session;
  if (!token) return null;
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) return null;
    const payload = jwt.verify(token, secret) as { id?: string };
    return typeof payload.id === "string" ? payload.id : null;
  } catch {
    return null;
  }
}

export function attachUserIfPresent(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const token = req.cookies?.mi_session;
  if (token) {
    try {
      const secret = process.env.SESSION_SECRET;
      if (secret) {
        const payload = jwt.verify(token, secret) as { id: string; email: string };
        req.user = { id: payload.id, email: payload.email };
        tagSentryUser(payload.id);
      }
    } catch {
    }
  }
  next();
}
