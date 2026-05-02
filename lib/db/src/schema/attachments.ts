import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const attachmentsTable = pgTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    recordId: integer("record_id"),
    journalId: integer("journal_id"),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("attachments_user_idx").on(table.userId),
    recordIdx: index("attachments_record_idx").on(table.recordId),
    journalIdx: index("attachments_journal_idx").on(table.journalId),
  })
);

export const insertAttachmentSchema = createInsertSchema(attachmentsTable).omit({ id: true, createdAt: true });
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachmentsTable.$inferSelect;
