import { pgTable, text, serial, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Lightweight audit log for GDPR-relevant user actions:
 *  - "data_export": a user (or admin on their behalf) downloaded a copy of
 *    their personal data via /api/profile/export.
 *  - "account_deletion": a user's account and personal data were erased via
 *    /api/profile/delete-account.
 *  - "consent_recorded": user explicitly opted in to non-essential email
 *    (e.g. onboarding) at sign-up.
 *
 * We deliberately store the user's email separately so the row remains
 * meaningful after the user row itself is deleted.
 */
export const userAuditLogTable = pgTable(
  "user_audit_log",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    userEmail: text("user_email"),
    action: text("action").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("user_audit_log_user_idx").on(t.userId),
    actionIdx: index("user_audit_log_action_idx").on(t.action),
    createdAtIdx: index("user_audit_log_created_at_idx").on(t.createdAt),
  }),
);

export type UserAuditLogEntry = typeof userAuditLogTable.$inferSelect;
