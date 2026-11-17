import { Router, type IRouter } from "express";
import { db, impactRecordsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { isAdminEmail } from "../lib/adminEmails.js";
import { getProxyMapByTitle } from "../lib/proxyStore.js";
import { correctResult, reviewCustomLines, type ReviewLine, type ReviewRecord } from "../lib/customValueReview.js";

/**
 * Admin-only: correct activities described in someone's own words that were
 * saved with a value that doesn't stand up (lib/customValueReview.ts). GET
 * lists them; POST corrects the lines the admin chose. Mounted at /admin.
 */
const router: IRouter = Router();

const MAX_LINES = 2000;

async function loadRecords(): Promise<ReviewRecord[]> {
  const rows = await db
    .select({
      id: impactRecordsTable.id,
      entryDate: impactRecordsTable.entryDate,
      resultJson: impactRecordsTable.resultJson,
      submittedToOrgId: impactRecordsTable.submittedToOrgId,
    })
    .from(impactRecordsTable)
    // jsonb::text renders with a space after the colon.
    .where(sql`${impactRecordsTable.resultJson}::text LIKE '%"category": "Custom"%'`);
  return rows.map((r) => ({ id: r.id, entryDate: r.entryDate, resultJson: r.resultJson, isOrgCopy: r.submittedToOrgId != null }));
}

const keyOf = (l: { recordId: number; index: number; activityId: string }) => `${l.recordId}:${l.index}:${l.activityId}`;

router.get("/custom-values", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdminEmail(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({ lines: reviewCustomLines(await loadRecords(), await getProxyMapByTitle()) });
});

router.post("/custom-values", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdminEmail(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const chosen = (req.body as { lines?: unknown } | undefined)?.lines;
  if (!Array.isArray(chosen) || chosen.length === 0 || chosen.length > MAX_LINES) {
    res.status(400).json({ error: "Choose the lines to correct." });
    return;
  }
  const wanted = new Set<string>();
  for (const c of chosen) {
    const l = c as { recordId?: unknown; index?: unknown; activityId?: unknown } | null;
    if (!l || !Number.isInteger(l.recordId) || !Number.isInteger(l.index) || typeof l.activityId !== "string") {
      res.status(400).json({ error: "Each line needs its entry, position and activity." });
      return;
    }
    wanted.add(keyOf(l as { recordId: number; index: number; activityId: string }));
  }

  // Decided again from what is saved now, so only lines still on the list
  // are touched.
  const records = await loadRecords();
  const lines = reviewCustomLines(records, await getProxyMapByTitle()).filter((l) => wanted.has(keyOf(l)));
  const byRecord = new Map<number, ReviewLine[]>();
  for (const l of lines) byRecord.set(l.recordId, [...(byRecord.get(l.recordId) ?? []), l]);

  await db.transaction(async (tx) => {
    for (const record of records) {
      const recordLines = byRecord.get(record.id);
      if (!recordLines) continue;
      const result = correctResult(record.resultJson as Record<string, unknown>, recordLines);
      await tx
        .update(impactRecordsTable)
        .set({
          totalValue: String(result.totalValue),
          impactValue: String(result.impactValue),
          contributionValue: String(result.contributionValue),
          donationsValue: String(result.donationsValue),
          personalDevelopmentValue: String(result.personalDevelopmentValue),
          // The column holds whole hours; the saved result keeps the exact figure.
          totalHours: Math.round(result.totalHours),
          resultJson: result,
        })
        .where(eq(impactRecordsTable.id, record.id));
    }
  });
  const before = lines.reduce((s, l) => s + l.before, 0);
  const after = lines.reduce((s, l) => s + l.after, 0);
  console.log(
    `[custom-values] ${req.user!.email} corrected ${lines.length} custom lines in ${byRecord.size} entries (£${before.toFixed(2)} to £${after.toFixed(2)})`,
  );
  res.json({
    corrected: lines.length,
    entries: byRecord.size,
    before: Math.round(before * 100) / 100,
    after: Math.round(after * 100) / 100,
    lines: reviewCustomLines(await loadRecords(), await getProxyMapByTitle()),
  });
});

export default router;
