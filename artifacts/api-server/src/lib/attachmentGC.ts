import { db, attachmentsTable } from "@workspace/db";
import { sweepOrphanedAttachments } from "./objectStorage.js";

const GC_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Run one global orphan-sweep pass across all user attachment prefixes.
 *
 * Queries the DB for every registered storageKey, builds a per-user map
 * keyed by sanitised userId (matching the GCS prefix layout), then calls
 * sweepOrphanedAttachments to delete unregistered objects older than 15 min.
 */
export async function runAttachmentGC(): Promise<void> {
  try {
    const rows = await db
      .select({ userId: attachmentsTable.userId, storageKey: attachmentsTable.storageKey })
      .from(attachmentsTable);

    const registeredKeysByUser = new Map<string, Set<string>>();
    for (const { userId, storageKey } of rows) {
      const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
      let keys = registeredKeysByUser.get(safeUserId);
      if (!keys) {
        keys = new Set();
        registeredKeysByUser.set(safeUserId, keys);
      }
      keys.add(storageKey);
    }

    const deleted = await sweepOrphanedAttachments(registeredKeysByUser);
    if (deleted > 0) {
      console.log(`[attachmentGC] Swept ${deleted} orphaned attachment object(s).`);
    }
  } catch (err) {
    console.error("[attachmentGC] GC run failed:", err);
  }
}

/**
 * Start the recurring attachment GC job.
 * Runs once immediately on startup, then every GC_INTERVAL_MS (30 minutes).
 * The timer is unref'd so it does not prevent process exit.
 */
export function startAttachmentGCJob(): void {
  runAttachmentGC().catch(() => {});
  const timer = setInterval(() => {
    runAttachmentGC().catch(() => {});
  }, GC_INTERVAL_MS);
  timer.unref();
  console.log(`[attachmentGC] Scheduled orphan GC every ${GC_INTERVAL_MS / 60_000} minutes.`);
}
