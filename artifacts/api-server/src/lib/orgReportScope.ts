/**
 * Who may see an organisation's reports, and which activities they cover.
 *
 * Managers see the whole organisation, or one group (`?groupId=<id>`), or
 * the activities counted for no group (`?groupId=none`). Group leads see
 * only the groups they lead: all of them by default, or one they lead.
 * Everyone else is refused. Report endpoints add `groupCondition(scope)` to
 * their record queries.
 */
import { db, orgGroupsTable, orgMembersTable, impactRecordsTable } from "@workspace/db";
import { eq, inArray, isNull, type SQL } from "drizzle-orm";
import { ledGroupIdsFor } from "./orgGroups.js";
import { NO_GROUP_KEY } from "./orgBreakdown.js";

export interface ReportScope {
  orgId: string;
  isManager: boolean;
  /** null = every activity of the organisation. */
  groupIds: string[] | null;
  /** Only activities counted for no group (managers only). */
  ungroupedOnly: boolean;
}

export type ScopeResult = { ok: true; scope: ReportScope } | { ok: false; status: number; error: string };

/**
 * The scope rule itself, given who the person is. `requested` is the
 * `groupId` query value; `orgGroupIds` are every group of the organisation,
 * archived included, so old reports stay reachable.
 */
export function decideScope(
  who: { orgId: string; isManager: boolean; ledGroupIds: string[] },
  requested: unknown,
  orgGroupIds: string[],
): ScopeResult {
  const groupId = typeof requested === "string" && requested.trim() ? requested.trim() : null;
  if (who.isManager) {
    if (!groupId) return { ok: true, scope: { orgId: who.orgId, isManager: true, groupIds: null, ungroupedOnly: false } };
    if (groupId === NO_GROUP_KEY) {
      return { ok: true, scope: { orgId: who.orgId, isManager: true, groupIds: null, ungroupedOnly: true } };
    }
    if (!orgGroupIds.includes(groupId)) return { ok: false, status: 404, error: "Group not found." };
    return { ok: true, scope: { orgId: who.orgId, isManager: true, groupIds: [groupId], ungroupedOnly: false } };
  }
  if (who.ledGroupIds.length === 0) {
    return { ok: false, status: 403, error: "Only organisation managers and group leads can see reports." };
  }
  if (!groupId) {
    return { ok: true, scope: { orgId: who.orgId, isManager: false, groupIds: who.ledGroupIds, ungroupedOnly: false } };
  }
  if (!who.ledGroupIds.includes(groupId)) {
    return { ok: false, status: 403, error: "You can only see reports for the groups you lead." };
  }
  return { ok: true, scope: { orgId: who.orgId, isManager: false, groupIds: [groupId], ungroupedOnly: false } };
}

export async function resolveReportScope(userId: string, requested: unknown): Promise<ScopeResult> {
  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
    columns: { orgId: true, role: true, status: true },
  });
  if (!membership) return { ok: false, status: 404, error: "You are not a member of any organisation." };
  const isManager = membership.role === "manager";
  const ledGroupIds = isManager || membership.status !== "active" ? [] : await ledGroupIdsFor(userId);
  const orgGroupIds = (
    await db.select({ id: orgGroupsTable.id }).from(orgGroupsTable).where(eq(orgGroupsTable.orgId, membership.orgId))
  ).map((g) => g.id);
  return decideScope({ orgId: membership.orgId, isManager, ledGroupIds }, requested, orgGroupIds);
}

/** The record condition for a scope; undefined when it covers everything. */
export function groupCondition(scope: ReportScope): SQL | undefined {
  if (scope.ungroupedOnly) return isNull(impactRecordsTable.orgGroupId);
  if (scope.groupIds) return inArray(impactRecordsTable.orgGroupId, scope.groupIds);
  return undefined;
}

/** Names of the organisation's groups by id, archived included (for labels). */
export async function groupNamesFor(orgId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: orgGroupsTable.id, name: orgGroupsTable.name })
    .from(orgGroupsTable)
    .where(eq(orgGroupsTable.orgId, orgId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** A label for the scope, for report titles: null for the whole organisation. */
export async function scopeLabel(scope: ReportScope): Promise<string | null> {
  if (scope.ungroupedOnly) return "Activities not counted for a group";
  if (!scope.groupIds) return null;
  const names = await groupNamesFor(scope.orgId);
  return scope.groupIds.map((id) => names.get(id) ?? "Unknown group").join(", ");
}
