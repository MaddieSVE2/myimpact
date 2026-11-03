/**
 * Small helpers for saving impact records, shared by /api/impact/save and
 * entries added by email (lib/emailActivityInbox.ts).
 */
import { db, impactRecordsTable, orgMembersTable, organisationsTable, recordVerificationsTable } from "@workspace/db";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { ONE_OFF_KINDS, YEARLY_HOUSEHOLD_ACTIVITY_IDS, type ValuationOptions } from "./impactData.js";

export function calendarMonthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Pick out the activity ids embedded in a stored `activitiesJson` payload so
// /save can detect when a user is about to create a new entry that would
// overlap an already-existing habit entry for the same calendar month.
export function extractActivityIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const a of raw) {
    if (a && typeof a === "object" && typeof (a as { activityId?: unknown }).activityId === "string") {
      ids.push((a as { activityId: string }).activityId);
    }
  }
  return ids;
}

// Automatic approvals carry one of these reasons. Any other approval was a
// manager's decision.
const AUTOMATIC_APPROVAL_REASONS = ["auto-verified", "member-submitted"];

/**
 * The organisation whose manager approved each of these records. A member
 * can't change the hours, activities or date of a record a manager approved;
 * they can delete it and log it again, and the new entry needs approving.
 */
export async function managerApprovedBy(recordIds: number[]): Promise<Map<number, string>> {
  if (recordIds.length === 0) return new Map();
  const rows = await db
    .select({ recordId: recordVerificationsTable.recordId, reason: recordVerificationsTable.reason, orgName: organisationsTable.name })
    .from(recordVerificationsTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, recordVerificationsTable.orgId))
    .where(and(inArray(recordVerificationsTable.recordId, recordIds), eq(recordVerificationsTable.status, "approved")));
  return new Map(
    rows.filter((r) => !AUTOMATIC_APPROVAL_REASONS.includes(r.reason ?? "")).map((r) => [r.recordId, r.orgName]),
  );
}

export function approvedHoursMessage(orgName: string): string {
  return `${orgName} approved these hours, so they can't be changed. To correct them, delete this entry and log it again.`;
}

// Auto-verification hook. Some organisations (e.g. universities) count every
// member activity toward their totals without a manager approval step. For
// each org the user actively belongs to where `autoVerifyActivities` is true,
// insert an approved record_verifications row for each freshly created
// impact record. The (recordId, orgId) unique constraint plus
// onConflictDoNothing makes this idempotent and safe against races with a
// manual verification request. Failures are logged but never block the save.
export async function autoVerifyRecordsForUser(userId: string, recordIds: number[]): Promise<void> {
  if (recordIds.length === 0) return;
  try {
    const autoOrgs = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .innerJoin(organisationsTable, eq(organisationsTable.id, orgMembersTable.orgId))
      .where(
        and(
          eq(orgMembersTable.userId, userId),
          eq(orgMembersTable.status, "active"),
          eq(organisationsTable.autoVerifyActivities, true),
        ),
      );
    if (autoOrgs.length === 0) return;

    const now = new Date();
    const values = autoOrgs.flatMap(({ orgId }) =>
      recordIds.map((recordId) => ({
        recordId,
        orgId,
        status: "approved" as const,
        decidedAt: now,
        reason: "auto-verified",
      })),
    );
    await db.insert(recordVerificationsTable).values(values).onConflictDoNothing();
  } catch (err) {
    console.error("[impact] auto-verify failed:", err);
  }
}

/**
 * Valuation options for a one-off entry dated `entryDate`: the household
 * habits this user has already counted in a one-off entry that calendar
 * year (leaving out `excludeRecordId`, the entry being edited).
 */
export async function oneOffValuation(
  userId: string,
  entryDate: Date,
  excludeRecordId?: number | null,
): Promise<ValuationOptions> {
  const year = entryDate.getUTCFullYear();
  const rows = await db
    .select({ id: impactRecordsTable.id, activitiesJson: impactRecordsTable.activitiesJson })
    .from(impactRecordsTable)
    .where(
      and(
        eq(impactRecordsTable.userId, userId),
        inArray(impactRecordsTable.kind, [...ONE_OFF_KINDS]),
        gte(impactRecordsTable.entryDate, new Date(Date.UTC(year, 0, 1))),
        lt(impactRecordsTable.entryDate, new Date(Date.UTC(year + 1, 0, 1))),
      ),
    );
  const counted = new Set<string>();
  for (const r of rows) {
    if (r.id === excludeRecordId) continue;
    for (const id of extractActivityIds(r.activitiesJson)) if (YEARLY_HOUSEHOLD_ACTIVITY_IDS.has(id)) counted.add(id);
  }
  return { oneOff: true, householdsCountedThisYear: counted };
}
