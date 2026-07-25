import { db, organisationsTable, orgMembersTable, orgMemberConsentsTable, impactRecordsTable } from "@workspace/db";
import { and, eq, gte, inArray, or, type SQL } from "drizzle-orm";

/**
 * Helpers for the two organisation data-sharing modes and the super-admin
 * dashboard-section gating / revocation enforcement.
 *
 *   'explicit_submission' — legacy behaviour: aggregates are built from all
 *     active members' records exactly as before.
 *   'consented_logging'   — aggregates only include records from members with
 *     an ACTIVE consent row, and only records dated on/after each member's
 *     shareFrom. Journals and pulse/wellbeing answers are never shared under
 *     either mode (they live in separate tables and are never queried here).
 */

export type DataSharingMode = "explicit_submission" | "consented_logging";

export const DASHBOARD_SECTION_KEYS = [
  "locationMap",
  "categories",
  "sroi",
  "valuePerMember",
  "topActivities",
  "pulseSummary",
] as const;
export type DashboardSectionKey = (typeof DASHBOARD_SECTION_KEYS)[number];
export type DashboardSections = Record<DashboardSectionKey, boolean>;

/** NULL / missing keys mean "visible" so existing orgs are unaffected. */
export function normalizeDashboardSections(raw: unknown): DashboardSections {
  const out = {} as DashboardSections;
  const obj = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const key of DASHBOARD_SECTION_KEYS) {
    out[key] = obj[key] === false ? false : true;
  }
  return out;
}

export function parseDashboardSectionsInput(raw: unknown): DashboardSections | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalid";
  const obj = raw as Record<string, unknown>;
  const out = {} as DashboardSections;
  for (const key of DASHBOARD_SECTION_KEYS) {
    const v = obj[key];
    if (v === undefined) { out[key] = true; continue; }
    if (typeof v !== "boolean") return "invalid";
    out[key] = v;
  }
  return out;
}

export interface OrgSharingContext {
  mode: DataSharingMode;
  revoked: boolean;
  sections: DashboardSections;
  /**
   * Returns the set of userIds whose records may appear in org aggregates,
   * plus (for consented orgs) each member's shareFrom cut-off.
   * For explicit-submission orgs this is all active members with no cut-off.
   */
  memberIds: string[];
  shareFromByUser: Map<string, Date>;
}

export async function getOrgSharingContext(orgId: string): Promise<OrgSharingContext> {
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, orgId),
    columns: { dataSharingMode: true, revokedAt: true, dashboardSections: true },
  });
  const mode: DataSharingMode = org?.dataSharingMode === "consented_logging" ? "consented_logging" : "explicit_submission";
  const sections = normalizeDashboardSections(org?.dashboardSections ?? null);
  const revoked = !!org?.revokedAt;

  const members = await db.query.orgMembersTable.findMany({
    where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")),
    columns: { userId: true },
  });
  const activeMemberIds = members.map((m) => m.userId);

  const shareFromByUser = new Map<string, Date>();
  let memberIds = activeMemberIds;

  if (mode === "consented_logging") {
    const consents = await db.query.orgMemberConsentsTable.findMany({
      where: and(eq(orgMemberConsentsTable.orgId, orgId), eq(orgMemberConsentsTable.status, "active")),
      columns: { userId: true, shareFrom: true },
    });
    const activeSet = new Set(activeMemberIds);
    memberIds = [];
    for (const c of consents) {
      if (!activeSet.has(c.userId)) continue;
      memberIds.push(c.userId);
      shareFromByUser.set(c.userId, c.shareFrom);
    }
  }

  return { mode, revoked, sections, memberIds, shareFromByUser };
}

/** True when a record dated `entryDate` for `userId` is inside the member's shared window. */
export function recordInSharedWindow(ctx: OrgSharingContext, userId: string, entryDate: Date | null | undefined): boolean {
  if (ctx.mode !== "consented_logging") return true;
  const from = ctx.shareFromByUser.get(userId);
  if (!from) return false;
  if (!entryDate) return false;
  return entryDate.getTime() >= from.getTime();
}

/**
 * Drizzle condition selecting the impact records shared with the org.
 * Explicit-submission orgs: all active members' records (legacy behaviour).
 * Consented orgs: per-member (userId = X AND entryDate >= shareFrom).
 * Returns undefined when no members share anything (caller should short-circuit).
 */
export function sharedRecordsCondition(ctx: OrgSharingContext): SQL | undefined {
  if (ctx.memberIds.length === 0) return undefined;
  if (ctx.mode !== "consented_logging") {
    return inArray(impactRecordsTable.userId, ctx.memberIds);
  }
  const parts: SQL[] = [];
  for (const userId of ctx.memberIds) {
    const from = ctx.shareFromByUser.get(userId);
    if (!from) continue;
    const cond = and(eq(impactRecordsTable.userId, userId), gte(impactRecordsTable.entryDate, from));
    if (cond) parts.push(cond);
  }
  if (parts.length === 0) return undefined;
  return or(...parts);
}

/** Returns true (and sends a 403) when the org has been revoked. */
export async function orgIsRevoked(orgId: string): Promise<boolean> {
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, orgId),
    columns: { revokedAt: true },
  });
  return !!org?.revokedAt;
}

export const REVOKED_ORG_MESSAGE =
  "This organisation's access has been revoked. Its data is retained for 180 days — the organisation contact can request an export during that period.";
