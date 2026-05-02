/**
 * Integration test for attachment cleanup on record / journal deletion.
 *
 * Run with:
 *   tsx artifacts/api-server/src/scripts/test-attachment-cleanup.ts
 *
 * The script uses a synthetic user id and inserts rows directly into the
 * attachments / impact_records / journal_entries tables. It then exercises
 * the deletion routes' helper functions and asserts that:
 *   - record-scoped attachments are removed when the record is deleted
 *   - journal-scoped attachments are removed when the journal is deleted
 *   - all record-linked attachments are removed by the "delete all" helper
 *   - storage usage for the user falls back to 0 after a full wipe
 *
 * The GCS deleteAttachment call is a best-effort no-op against unknown keys,
 * so the script does not need real object storage to validate behaviour.
 */
import {
  db,
  pool,
  attachmentsTable,
  impactRecordsTable,
  journalEntriesTable,
} from "@workspace/db";
import { and, eq, sum } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  deleteAttachmentsForRecord,
  deleteAttachmentsForJournal,
  deleteAllRecordAttachmentsForUser,
} from "../lib/attachmentCleanup.js";

const USER_ID = `test-cleanup-${randomUUID()}`;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  FAIL — ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`  ok — ${msg}`);
}

async function getUsageBytes(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(attachmentsTable.byteSize) })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.userId, userId));
  return Number(row?.total ?? 0);
}

async function countRows(userId: string): Promise<number> {
  const rows = await db
    .select({ id: attachmentsTable.id })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.userId, userId));
  return rows.length;
}

async function insertRecord(): Promise<number> {
  const [r] = await db
    .insert(impactRecordsTable)
    .values({
      userId: USER_ID,
      name: "test record",
      totalValue: "0",
      impactValue: "0",
      contributionValue: "0",
      donationsValue: "0",
      personalDevelopmentValue: "0",
      totalHours: 0,
      activitiesJson: [],
      resultJson: {},
    })
    .returning();
  return r.id;
}

async function insertJournal(): Promise<number> {
  const [j] = await db
    .insert(journalEntriesTable)
    .values({ userId: USER_ID, type: "entry", text: "test" })
    .returning();
  return j.id;
}

async function insertAttachment(opts: {
  recordId?: number | null;
  journalId?: number | null;
  kind: "photo" | "receipt";
  bytes: number;
}) {
  await db.insert(attachmentsTable).values({
    userId: USER_ID,
    recordId: opts.recordId ?? null,
    journalId: opts.journalId ?? null,
    kind: opts.kind,
    storageKey: `attachments/${USER_ID}/${randomUUID()}`,
    mimeType: opts.kind === "receipt" ? "application/pdf" : "image/png",
    byteSize: opts.bytes,
  });
}

async function cleanup() {
  await db.delete(attachmentsTable).where(eq(attachmentsTable.userId, USER_ID));
  await db.delete(impactRecordsTable).where(eq(impactRecordsTable.userId, USER_ID));
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.userId, USER_ID));
}

async function main() {
  console.log(`Running attachment cleanup test for user ${USER_ID}`);

  try {
    // --- Case 1: deleting one record removes its attachments ---
    console.log("\nCase 1: delete one record");
    const recordA = await insertRecord();
    const recordB = await insertRecord();
    await insertAttachment({ recordId: recordA, kind: "photo", bytes: 100 });
    await insertAttachment({ recordId: recordA, kind: "photo", bytes: 200 });
    await insertAttachment({ recordId: recordA, kind: "receipt", bytes: 300 });
    await insertAttachment({ recordId: recordB, kind: "photo", bytes: 400 });

    assert((await countRows(USER_ID)) === 4, "4 attachments seeded");
    assert((await getUsageBytes(USER_ID)) === 1000, "usage = 1000 bytes before delete");

    const removedA = await deleteAttachmentsForRecord(USER_ID, recordA);
    assert(removedA === 3, "deleteAttachmentsForRecord returns 3");

    const remainingA = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.userId, USER_ID), eq(attachmentsTable.recordId, recordA)));
    assert(remainingA.length === 0, "no attachments remain for recordA");

    const remainingB = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.userId, USER_ID), eq(attachmentsTable.recordId, recordB)));
    assert(remainingB.length === 1, "recordB attachment is untouched");
    assert((await getUsageBytes(USER_ID)) === 400, "usage drops to 400 after recordA wipe");

    // --- Case 2: deleting one journal entry removes its photo ---
    console.log("\nCase 2: delete one journal entry");
    const journalA = await insertJournal();
    const journalB = await insertJournal();
    await insertAttachment({ journalId: journalA, kind: "photo", bytes: 500 });
    await insertAttachment({ journalId: journalB, kind: "photo", bytes: 600 });

    assert((await getUsageBytes(USER_ID)) === 1500, "usage = 1500 with two journals");

    const removedJ = await deleteAttachmentsForJournal(USER_ID, journalA);
    assert(removedJ === 1, "deleteAttachmentsForJournal returns 1");

    const remainingJa = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.userId, USER_ID), eq(attachmentsTable.journalId, journalA)));
    assert(remainingJa.length === 0, "no attachments remain for journalA");

    const remainingJb = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.userId, USER_ID), eq(attachmentsTable.journalId, journalB)));
    assert(remainingJb.length === 1, "journalB attachment is untouched");

    // --- Case 3: delete-all-records leaves journal photos intact ---
    console.log("\nCase 3: delete-all-records helper preserves journal photos");
    // Currently we have: recordB photo (400) + journalB photo (600) = 1000
    assert((await getUsageBytes(USER_ID)) === 1000, "usage = 1000 before delete-all");

    const removedAll = await deleteAllRecordAttachmentsForUser(USER_ID);
    assert(removedAll === 1, "deleteAllRecordAttachmentsForUser removed the 1 record attachment");

    const recordRowsLeft = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.userId, USER_ID), eq(attachmentsTable.recordId, recordB)));
    assert(recordRowsLeft.length === 0, "no record-linked attachments remain");

    assert((await getUsageBytes(USER_ID)) === 600, "only journalB photo remains (600 bytes)");

    // --- Case 4: full wipe (records + journals) returns usage to 0 ---
    console.log("\nCase 4: full wipe → storage usage = 0");
    // Reset state with fresh data so this case stands on its own.
    await cleanup();

    const r1 = await insertRecord();
    const r2 = await insertRecord();
    const j1 = await insertJournal();
    const j2 = await insertJournal();
    await insertAttachment({ recordId: r1, kind: "photo", bytes: 111 });
    await insertAttachment({ recordId: r1, kind: "receipt", bytes: 222 });
    await insertAttachment({ recordId: r2, kind: "photo", bytes: 333 });
    await insertAttachment({ journalId: j1, kind: "photo", bytes: 444 });
    await insertAttachment({ journalId: j2, kind: "photo", bytes: 555 });

    assert((await getUsageBytes(USER_ID)) === 1665, "usage seeded to 1665 bytes");

    // Simulate the API: every record delete removes its attachments,
    // every journal delete removes its attachment.
    await deleteAttachmentsForRecord(USER_ID, r1);
    await deleteAttachmentsForRecord(USER_ID, r2);
    await deleteAttachmentsForJournal(USER_ID, j1);
    await deleteAttachmentsForJournal(USER_ID, j2);

    assert((await countRows(USER_ID)) === 0, "no attachment rows remain after full wipe");
    assert((await getUsageBytes(USER_ID)) === 0, "storage usage returns to 0 after full wipe");

    console.log("\nAll attachment cleanup checks passed.");
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
  void pool.end();
});
