import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

/**
 * One row per email sent through Resend (artifacts/api-server/src/lib/
 * emailLog.ts records it), updated by Resend's delivery webhook. Holds the
 * recipients, subject and outcome only, never the message body, and is
 * deleted after EMAIL_LOG_RETENTION_DAYS or when the recipient deletes
 * their account.
 */
export const emailLogTable = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    /** Resend's email id; null when the send failed before Resend accepted it. */
    resendId: text("resend_id").unique(),
    toAddresses: text("to_addresses").array().notNull(),
    subject: text("subject").notNull(),
    // "sign-in" | "onboarding" | "monthly-digest" | "approval-digest" |
    // "organisation" | "account" | "challenge" | "internal"
    category: text("category").notNull(),
    // "sent" | "failed" | "delayed" | "delivered" | "opened" | "clicked" |
    // "bounced" | "complained" | "suppressed"
    status: text("status").notNull(),
    error: text("error"),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    lastEventAt: timestamp("last_event_at"),
  },
  (t) => ({
    sentAtIdx: index("email_log_sent_at_idx").on(t.sentAt),
    categoryIdx: index("email_log_category_idx").on(t.category),
  }),
);

export type EmailLogEntry = typeof emailLogTable.$inferSelect;
