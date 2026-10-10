/**
 * Small helpers for saving impact records, shared by /api/impact/save and
 * entries added by email (lib/emailActivityInbox.ts).
 */
import { db, orgMembersTable, organisationsTable, recordVerificationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

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
