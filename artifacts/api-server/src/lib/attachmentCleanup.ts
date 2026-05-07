import { db, attachmentsTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { deleteAttachment } from "./objectStorage.js";

async function deleteStorageObjects(storageKeys: string[]): Promise<void> {
  if (storageKeys.length === 0) return;
  await Promise.all(storageKeys.map((key) => deleteAttachment(key)));
}

/**
 * Delete every attachment (DB row + GCS object) tied to a single impact record.
 * Returns the number of attachments removed.
 */
export async function deleteAttachmentsForRecord(
  userId: string,
  recordId: number,
): Promise<number> {
  const rows = await db
    .select({ storageKey: attachmentsTable.storageKey })
    .from(attachmentsTable)
    .where(and(eq(attachmentsTable.userId, userId), eq(attachmentsTable.recordId, recordId)));

  if (rows.length === 0) return 0;

  await deleteStorageObjects(rows.map((r) => r.storageKey));
  await db
    .delete(attachmentsTable)
    .where(and(eq(attachmentsTable.userId, userId), eq(attachmentsTable.recordId, recordId)));

  return rows.length;
}

/**
 * Delete every attachment (DB row + GCS object) tied to a single journal entry.
 * Returns the number of attachments removed.
 */
export async function deleteAttachmentsForJournal(
  userId: string,
  journalId: number,
): Promise<number> {
  const rows = await db
    .select({ storageKey: attachmentsTable.storageKey })
    .from(attachmentsTable)
    .where(and(eq(attachmentsTable.userId, userId), eq(attachmentsTable.journalId, journalId)));

  if (rows.length === 0) return 0;

  await deleteStorageObjects(rows.map((r) => r.storageKey));
  await db
    .delete(attachmentsTable)
    .where(and(eq(attachmentsTable.userId, userId), eq(attachmentsTable.journalId, journalId)));

  return rows.length;
}

/**
 * Delete every attachment (record- AND journal-linked) belonging to a user.
 * Used during account deletion when we're erasing everything the user owns.
 */
export async function deleteAllAttachmentsForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ storageKey: attachmentsTable.storageKey })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.userId, userId));

  if (rows.length === 0) return 0;

  await deleteStorageObjects(rows.map((r) => r.storageKey));
  await db.delete(attachmentsTable).where(eq(attachmentsTable.userId, userId));

  return rows.length;
}

/**
 * Delete every record-linked attachment (photo + receipt) for a user.
 * Used when a user wipes their entire impact history. Journal-linked
 * attachments are left untouched — those are removed when the journal
 * entry itself is deleted.
 */
export async function deleteAllRecordAttachmentsForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ storageKey: attachmentsTable.storageKey })
    .from(attachmentsTable)
    .where(and(eq(attachmentsTable.userId, userId), isNotNull(attachmentsTable.recordId)));

  if (rows.length === 0) return 0;

  await deleteStorageObjects(rows.map((r) => r.storageKey));
  await db
    .delete(attachmentsTable)
    .where(and(eq(attachmentsTable.userId, userId), isNotNull(attachmentsTable.recordId)));

  return rows.length;
}
