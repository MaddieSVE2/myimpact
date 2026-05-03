import { pgTable, text, serial, integer, timestamp, index, unique } from "drizzle-orm/pg-core";

/**
 * Tracks presigned upload URLs that have been issued but not yet registered.
 * Each row reserves quota so that concurrent /upload-url calls cannot all
 * observe the same stale balance and collectively overshoot the user quota.
 *
 * Rows are cleaned up:
 *   - Immediately when the upload is registered via /register.
 *   - By a periodic sweep that deletes rows older than the signed-URL TTL.
 */
export const attachmentPendingReservationsTable = pgTable(
  "attachment_pending_reservations",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    storageKey: text("storage_key").notNull(),
    byteSize: integer("byte_size").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("att_pending_user_idx").on(t.userId),
    storageKeyUnique: unique("att_pending_storage_key_unique").on(t.storageKey),
  })
);

export type AttachmentPendingReservation = typeof attachmentPendingReservationsTable.$inferSelect;
