import { Router, type IRouter } from "express";
import { db, impactRecordsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { isAdminEmail } from "../lib/adminEmails.js";
import { ONE_OFF_KINDS } from "../lib/impactData.js";
import { planRevaluation, summarise, type RevalueRecord } from "../lib/revalueOneOff.js";

/**
 * Admin-only: re-value one-off entries saved before yearly activities were
 * valued per occasion (lib/revalueOneOff.ts). GET previews; POST applies.
 * Mounted at /admin.
 */
const router: IRouter = Router();

async function loadPlan() {
  const rows = await db
    .select({
      id: impactRecordsTable.id,
      userId: impactRecordsTable.userId,
      kind: impactRecordsTable.kind,
      entryDate: impactRecordsTable.entryDate,
      activitiesJson: impactRecordsTable.activitiesJson,
      resultJson: impactRecordsTable.resultJson,
      donationsValue: impactRecordsTable.donationsValue,
      totalValue: impactRecordsTable.totalValue,
      submittedToOrgId: impactRecordsTable.submittedToOrgId,
    })
    .from(impactRecordsTable)
    .where(inArray(impactRecordsTable.kind, [...ONE_OFF_KINDS]));
  const records: RevalueRecord[] = rows.map((r) => ({ ...r, kind: r.kind ?? "", isOrgCopy: r.submittedToOrgId != null }));
  return planRevaluation(records);
}

router.get("/revalue-one-off", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdminEmail(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(summarise(await loadPlan()));
});

router.post("/revalue-one-off", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdminEmail(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const changes = await loadPlan();
  await db.transaction(async (tx) => {
    for (const c of changes) {
      await tx
        .update(impactRecordsTable)
        .set({
          totalValue: String(c.result.totalValue),
          impactValue: String(c.result.impactValue),
          contributionValue: String(c.result.contributionValue),
          donationsValue: String(c.result.donationsValue),
          personalDevelopmentValue: String(c.result.personalDevelopmentValue),
          totalHours: c.result.totalHours,
          resultJson: c.result,
        })
        .where(eq(impactRecordsTable.id, c.id));
    }
  });
  console.log(`[revalue-one-off] ${req.user!.email} re-valued ${changes.length} one-off entries`);
  res.json({ applied: true, ...summarise(changes) });
});

export default router;

