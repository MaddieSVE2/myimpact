import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";

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

/**
 * A reply to one of our emails, received by Resend at the reply address
 * (EMAIL_REPLY_TO) and stored by artifacts/api-server/src/lib/emailReplies.ts.
 * Linked to the latest email we sent that person. Deleted with the email log.
 */
export const emailRepliesTable = pgTable(
  "email_replies",
  {
    id: serial("id").primaryKey(),
    /** Resend's id for the received email; makes webhook retries harmless. */
    resendReceivedId: text("resend_received_id").notNull().unique(),
    emailLogId: integer("email_log_id").references(() => emailLogTable.id, { onDelete: "set null" }),
    fromAddress: text("from_address").notNull(),
    subject: text("subject").notNull(),
    /** Plain text of the reply, truncated; null until fetched from Resend. */
    textBody: text("text_body"),
    /** Where the reply was forwarded, or why it was not. */
    forwardStatus: text("forward_status"),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  (t) => ({
    receivedAtIdx: index("email_replies_received_at_idx").on(t.receivedAt),
    fromIdx: index("email_replies_from_idx").on(t.fromAddress),
  }),
);

export type EmailReply = typeof emailRepliesTable.$inferSelect;
