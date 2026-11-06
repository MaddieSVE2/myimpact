/**
 * Organisation groups (clubs, teams). Members can be in several groups of
 * their organisation; each activity counts for at most one group
 * (impact_records.org_group_id). A member in exactly one group has it set
 * automatically; a member in several chooses, and a regular activity
 * remembers the choice (recurring_templates.sharing_group_id).
 */
import {
  db,
  orgGroupsTable,
  orgGroupMembersTable,
  orgMembersTable,
  orgPendingGroupMembersTable,
  impactRecordsTable,
  recurringTemplatesTable,
  challengesTable,
  challengeGroupsTable,
  challengeParticipantsTable,
} from "@workspace/db";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

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

/**
 * Puts active members of the organisation in a group, and in the group's
 * running challenges. Adding someone as a member leaves a lead a lead.
 */
export async function addToGroup(groupId: string, userIds: string[], role: GroupRole = "member"): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const insert = db.insert(orgGroupMembersTable).values(ids.map((userId) => ({ groupId, userId, role })));
  await (role === "lead"
    ? insert.onConflictDoUpdate({ target: [orgGroupMembersTable.groupId, orgGroupMembersTable.userId], set: { role } })
    : insert.onConflictDoNothing());
  await joinGroupChallenges(ids, [groupId]);
}

/** Adds people to the challenges for these groups that haven't ended (challenge_groups). */
export async function joinGroupChallenges(userIds: string[], groupIds: string[]): Promise<void> {
  if (userIds.length === 0 || groupIds.length === 0) return;
  const challenges = await db
    .selectDistinct({ id: challengeGroupsTable.challengeId })
    .from(challengeGroupsTable)
    .innerJoin(challengesTable, eq(challengesTable.id, challengeGroupsTable.challengeId))
    .where(and(inArray(challengeGroupsTable.groupId, groupIds), gt(challengesTable.endDate, new Date())));
  if (challenges.length === 0) return;
  await db
    .insert(challengeParticipantsTable)
    .values(challenges.flatMap((c) => userIds.map((userId) => ({ challengeId: c.id, userId }))))
    .onConflictDoNothing();
}

/**
 * Reads the groups a challenge or survey is for: [] for the whole
 * organisation, otherwise ids of the organisation's active groups. null when
 * the value isn't a list of them.
 */
export async function parseAudience(orgId: string, raw: unknown): Promise<string[] | null> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) return null;
  const ids = [...new Set(raw as string[])];
  if (ids.length === 0) return [];
  const found = await db
    .select({ id: orgGroupsTable.id })
    .from(orgGroupsTable)
    .where(and(eq(orgGroupsTable.orgId, orgId), inArray(orgGroupsTable.id, ids), isNull(orgGroupsTable.archivedAt)));
  return found.length === ids.length ? ids : null;
}

export const AUDIENCE_ERROR = "Choose groups that are in your organisation and not archived.";

/** Active members of the organisation who are in any of these groups. */
export async function activeMembersOfGroups(orgId: string, groupIds: string[]): Promise<string[]> {
  if (groupIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ userId: orgGroupMembersTable.userId })
    .from(orgGroupMembersTable)
    .innerJoin(
      orgMembersTable,
      and(
        eq(orgMembersTable.userId, orgGroupMembersTable.userId),
        eq(orgMembersTable.orgId, orgId),
        eq(orgMembersTable.status, "active"),
      ),
    )
    .where(inArray(orgGroupMembersTable.groupId, groupIds));
  return rows.map((r) => r.userId);
}

/** Group names by id, for showing who a challenge or survey is for. */
export async function groupNamesById(groupIds: string[]): Promise<Map<string, string>> {
  if (groupIds.length === 0) return new Map();
  const rows = await db
    .select({ id: orgGroupsTable.id, name: orgGroupsTable.name })
    .from(orgGroupsTable)
    .where(inArray(orgGroupsTable.id, [...new Set(groupIds)]));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export function normaliseEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Saves group places for someone who isn't an active member yet. A place
 * saved as lead stays lead.
 */
export async function savePendingPlacements(
  orgId: string,
  email: string,
  placements: { groupId: string; role: GroupRole }[],
): Promise<void> {
  for (const p of placements) {
    const insert = db
      .insert(orgPendingGroupMembersTable)
      .values({ orgId, email: normaliseEmail(email), groupId: p.groupId, role: p.role });
    await (p.role === "lead"
      ? insert.onConflictDoUpdate({
          target: [orgPendingGroupMembersTable.orgId, orgPendingGroupMembersTable.email, orgPendingGroupMembersTable.groupId],
          set: { role: "lead" },
        })
      : insert.onConflictDoNothing());
  }
}

/** Names of the active groups saved for an email address, for their invite. */
export async function pendingGroupNames(orgId: string, email: string): Promise<string[]> {
  const rows = await db
    .select({ name: orgGroupsTable.name })
    .from(orgPendingGroupMembersTable)
    .innerJoin(orgGroupsTable, eq(orgGroupsTable.id, orgPendingGroupMembersTable.groupId))
    .where(
      and(
        eq(orgPendingGroupMembersTable.orgId, orgId),
        eq(orgPendingGroupMembersTable.email, normaliseEmail(email)),
        isNull(orgGroupsTable.archivedAt),
      ),
    )
    .orderBy(orgGroupsTable.name);
  return rows.map((r) => r.name);
}

/** Forgets the group places saved for an email address (invite revoked, request turned down). */
export async function forgetPendingPlacements(orgId: string, email: string | null | undefined): Promise<void> {
  const normalized = normaliseEmail(email);
  if (!normalized) return;
  await db
    .delete(orgPendingGroupMembersTable)
    .where(and(eq(orgPendingGroupMembersTable.orgId, orgId), eq(orgPendingGroupMembersTable.email, normalized)));
}

/**
 * Puts someone whose membership just became active in the groups saved for
 * their email address, then forgets them. Archived groups are skipped.
 */
export async function applyPendingPlacements(orgId: string, userId: string, email: string | null | undefined): Promise<void> {
  const normalized = normaliseEmail(email);
  if (!normalized) return;
  const placements = await db
    .select({ groupId: orgPendingGroupMembersTable.groupId, role: orgPendingGroupMembersTable.role })
    .from(orgPendingGroupMembersTable)
    .innerJoin(orgGroupsTable, eq(orgGroupsTable.id, orgPendingGroupMembersTable.groupId))
    .where(
      and(
        eq(orgPendingGroupMembersTable.orgId, orgId),
        eq(orgPendingGroupMembersTable.email, normalized),
        isNull(orgGroupsTable.archivedAt),
      ),
    );
  for (const p of placements) {
    await addToGroup(p.groupId, [userId], isGroupRole(p.role) ? p.role : "member");
  }
  await forgetPendingPlacements(orgId, normalized);
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
