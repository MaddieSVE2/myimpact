/**
 * Organisation groups (clubs, teams). Members can be in several groups of
 * their organisation; each activity counts for at most one group
 * (impact_records.org_group_id). A member in exactly one group has it set
 * automatically; a member in several chooses, and a regular activity
 * remembers the choice (recurring_templates.sharing_group_id).
 */
import { db, orgGroupsTable, orgGroupMembersTable, orgMembersTable, impactRecordsTable, recurringTemplatesTable } from "@workspace/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";

export const GROUP_NAME_MAX = 80;
export const GROUP_DESCRIPTION_MAX = 500;

export type GroupRole = "member" | "lead";

export function isGroupRole(value: unknown): value is GroupRole {
  return value === "member" || value === "lead";
}

/** Trimmed name, or null when empty or too long. */
export function cleanGroupName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name && name.length <= GROUP_NAME_MAX ? name : null;
}

/**
 * The group a new activity counts for: the remembered choice if the member
 * can still use it, otherwise their only group, otherwise none.
 */
export function pickGroup(activeGroupIds: string[], remembered: string | null | undefined): string | null {
  if (remembered && activeGroupIds.includes(remembered)) return remembered;
  return activeGroupIds.length === 1 ? activeGroupIds[0]! : null;
}

/** The active member's organisation, or null. Members belong to one organisation. */
export async function activeOrgIdFor(userId: string): Promise<string | null> {
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")),
    columns: { orgId: true },
  });
  return membership?.orgId ?? null;
}

/** Active (not archived) groups of the member's organisation that they belong to. */
export async function activeGroupIdsFor(userId: string): Promise<string[]> {
  const orgId = await activeOrgIdFor(userId);
  if (!orgId) return [];
  const rows = await db
    .select({ id: orgGroupsTable.id })
    .from(orgGroupMembersTable)
    .innerJoin(orgGroupsTable, eq(orgGroupsTable.id, orgGroupMembersTable.groupId))
    .where(and(eq(orgGroupMembersTable.userId, userId), eq(orgGroupsTable.orgId, orgId), isNull(orgGroupsTable.archivedAt)));
  return rows.map((r) => r.id);
}

/** The group a new activity by `userId` should count for (see pickGroup). */
export async function defaultGroupFor(userId: string, remembered?: string | null): Promise<string | null> {
  return pickGroup(await activeGroupIdsFor(userId), remembered);
}

/** True when `userId` may count an activity for `groupId`: an active group of their organisation they belong to. */
export async function canUseGroup(userId: string, groupId: string): Promise<boolean> {
  return (await activeGroupIdsFor(userId)).includes(groupId);
}

/** Groups `userId` leads in their organisation (active groups only). */
export async function ledGroupIdsFor(userId: string): Promise<string[]> {
  const orgId = await activeOrgIdFor(userId);
  if (!orgId) return [];
  const rows = await db
    .select({ id: orgGroupsTable.id })
    .from(orgGroupMembersTable)
    .innerJoin(orgGroupsTable, eq(orgGroupsTable.id, orgGroupMembersTable.groupId))
    .where(
      and(
        eq(orgGroupMembersTable.userId, userId),
        eq(orgGroupMembersTable.role, "lead"),
        eq(orgGroupsTable.orgId, orgId),
        isNull(orgGroupsTable.archivedAt),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Sets the group an activity counts for, on the record and on its linked
 * organisation copy or personal twin (see notOrgTwinCondition), so the
 * organisation's reports see the same group whichever copy they count.
 * Returns false when the record is not the member's.
 */
export async function setRecordGroup(userId: string, recordId: number, groupId: string | null): Promise<boolean> {
  const record = await db.query.impactRecordsTable.findFirst({
    where: and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)),
    columns: { id: true, sourceReportId: true, resultJson: true },
  });
  if (!record) return false;
  const linkedCopy = Number((record.resultJson as { orgRecordId?: unknown } | null)?.orgRecordId);
  await db
    .update(impactRecordsTable)
    .set({ orgGroupId: groupId })
    .where(
      and(
        eq(impactRecordsTable.userId, userId),
        or(
          eq(impactRecordsTable.id, record.id),
          // Its organisation copy.
          Number.isInteger(linkedCopy) ? eq(impactRecordsTable.id, linkedCopy) : undefined,
          eq(impactRecordsTable.sourceReportId, record.id),
          // Its personal twin, when this is the organisation copy.
          record.sourceReportId ? eq(impactRecordsTable.id, record.sourceReportId) : undefined,
          sql`(${impactRecordsTable.resultJson} ->> 'orgRecordId') = ${String(record.id)}`,
        ),
      ),
    );
  return true;
}

/** Takes someone out of every group of an organisation (they left or were removed from it). */
export async function removeFromOrgGroups(orgId: string, userId: string): Promise<void> {
  await db
    .delete(orgGroupMembersTable)
    .where(
      and(
        eq(orgGroupMembersTable.userId, userId),
        sql`${orgGroupMembersTable.groupId} IN (SELECT id FROM org_groups WHERE org_id = ${orgId})`,
      ),
    );
}

/** Remembers the group for a member's regular activity. False when it is not theirs. */
export async function setTemplateGroup(userId: string, templateId: number, groupId: string | null): Promise<boolean> {
  const updated = await db
    .update(recurringTemplatesTable)
    .set({ sharingGroupId: groupId })
    .where(and(eq(recurringTemplatesTable.id, templateId), eq(recurringTemplatesTable.userId, userId)))
    .returning({ id: recurringTemplatesTable.id });
  return updated.length > 0;
}
