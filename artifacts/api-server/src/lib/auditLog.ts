import type { Request } from "express";
import { db, userAuditLogTable } from "@workspace/db";

/**
 * Append a row to the user audit log. Errors are swallowed and logged so
 * that audit-trail failures never block the underlying operation (e.g. a
 * data export should still succeed if the audit insert errors).
 */
export async function recordAuditEvent(opts: {
  userId: string | null;
  userEmail: string | null;
  action: string;
  req?: Request;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const ip = opts.req?.ip ?? null;
    const userAgent = opts.req?.headers["user-agent"];
    const ua = typeof userAgent === "string" ? userAgent.slice(0, 500) : null;
    await db.insert(userAuditLogTable).values({
      userId: opts.userId,
      userEmail: opts.userEmail,
      action: opts.action,
      ip,
      userAgent: ua,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit-log] insert failed", { action: opts.action, err });
  }
}
