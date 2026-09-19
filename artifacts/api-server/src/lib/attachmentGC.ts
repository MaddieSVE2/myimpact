import {
  db,
  attachmentsTable,
  attachmentPendingReservationsTable,
} from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { deleteAttachment } from "./objectStorage.js";

const GC_INTERVAL_MS = 30 * 60 * 1000;
const EXPIRED_UPLOAD_GRACE_MS = 15 * 60 * 1000;

/**
 * Delete objects for upload reservations that have explicitly expired.
 *
 * Cleanup is deliberately driven by reservation rows rather than by comparing
 * an entire storage bucket with one database snapshot. A deployment can start
 * while its database/storage environment is still settling; treating every
 * object absent from that snapshot as an orphan risks deleting valid files.
 *
 * A reservation can remain after a successful registration if its final
 * best-effort cleanup failed, so registered attachment keys are checked again
 * before any object is deleted.
 */
export async function runAttachmentGC(): Promise<void> {
  try {
    // Keep a grace period after the signed URL expires so an upload completed
    // near the deadline can still finish its registration request safely.
    const cutoff = new Date(Date.now() - EXPIRED_UPLOAD_GRACE_MS);
    const expired = await db
      .select({ storageKey: attachmentPendingReservationsTable.storageKey })
      .from(attachmentPendingReservationsTable)
      .where(lt(attachmentPendingReservationsTable.expiresAt, cutoff));

    let deleted = 0;
    for (const { storageKey } of expired) {
      const [registered] = await db
        .select({ id: attachmentsTable.id })
        .from(attachmentsTable)
        .where(eq(attachmentsTable.storageKey, storageKey))
        .limit(1);

      if (!registered) {
        await deleteAttachment(storageKey);
        deleted++;
      }

      await db
        .delete(attachmentPendingReservationsTable)
        .where(eq(attachmentPendingReservationsTable.storageKey, storageKey));
    }

    if (deleted > 0) {
      console.log(`[attachmentGC] Removed ${deleted} expired pending upload object(s).`);
    }
  } catch (err) {
    console.error("[attachmentGC] GC run failed:", err);
  }
}

/**
 * Start the recurring pending-upload cleanup job.
 * Runs once immediately on startup, then every GC_INTERVAL_MS (30 minutes).
 * The timer is unref'd so it does not prevent process exit.
 */
export function startAttachmentGCJob(): void {
  runAttachmentGC().catch(() => {});
  const timer = setInterval(() => {
    runAttachmentGC().catch(() => {});
  }, GC_INTERVAL_MS);
  timer.unref();
  console.log(`[attachmentGC] Scheduled expired-upload cleanup every ${GC_INTERVAL_MS / 60_000} minutes.`);
}
