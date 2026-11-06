import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import {
  db,
  organisationsTable,
  orgDeactivatedMembersTable,
  orgGroupsTable,
  orgGroupMembersTable,
  orgInvitesTable,
  orgMembersTable,
  orgAuditLogTable,
  usersTable,
} from "@workspace/db";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import {
  GROUP_DESCRIPTION_MAX,
  addToGroup,
  canUseGroup,
  cleanGroupName,
  isGroupRole,
  joinGroupChallenges,
  savePendingPlacements,
  setRecordGroup,
  setTemplateGroup,
  type GroupRole,
} from "../lib/orgGroups.js";
import { MAX_IMPORT_ROWS, planGroupImport, type ImportPlan, type ImportRow } from "../lib/groupImport.js";
import { parseAllowedDomains } from "../lib/orgDomains.js";
import { sendInvitesInBackground } from "../lib/orgInviteEmail.js";
import { createRateLimiter } from "../lib/rateLimiter.js";

/**
 * Organisation groups (lib/orgGroups.ts). Mounted at /org.
 *
 * Managers: create, rename, archive groups; add and remove members, one at a
 * time, several at once or from a list; make someone a lead. Members: see their organisation's groups, join and leave,
 * and choose which group an activity counts for. Leads: see their group's
 * members (names only).
 */
const router: IRouter = Router();

interface Membership {
  orgId: string;
  role: string;
}

async function activeMembership(userId: string): Promise<Membership | null> {
  const m = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")),
    columns: { orgId: true, role: true },
  });
  return m ?? null;
}

async function groupInOrg(groupId: string, orgId: string) {
  return (
    (await db.query.orgGroupsTable.findFirst({
      where: and(eq(orgGroupsTable.id, groupId), eq(orgGroupsTable.orgId, orgId)),
    })) ?? null
  );
}

async function audit(orgId: string, actorUserId: string, action: string, targetId: string, metadata: Record<string, unknown>) {
  await db.insert(orgAuditLogTable).values({ orgId, actorUserId, action, targetType: "group", targetId, metadata });
}

function cleanDescription(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || (typeof raw === "string" && !raw.trim())) return null;
  return typeof raw === "string" ? raw.trim().slice(0, GROUP_DESCRIPTION_MAX) : undefined;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** True when another group in the organisation already has this name, ignoring case. */
async function nameTaken(orgId: string, name: string, exceptGroupId?: string): Promise<boolean> {
  const clash = await db.query.orgGroupsTable.findFirst({
    where: and(
      eq(orgGroupsTable.orgId, orgId),
      sql`lower(${orgGroupsTable.name}) = lower(${name})`,
      exceptGroupId ? sql`${orgGroupsTable.id} <> ${exceptGroupId}` : undefined,
    ),
    columns: { id: true },
  });
  return Boolean(clash);
}

const NAME_TAKEN = "There is already a group with that name.";

// ---------------------------------------------------------------------------
// Managers (and leads, read-only)
// ---------------------------------------------------------------------------

router.get("/groups", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (!me) {
    res.status(404).json({ error: "You are not a member of an organisation." });
    return;
  }
  const isManager = me.role === "manager";
  const rows = await db
    .select({
      id: orgGroupsTable.id,
      name: orgGroupsTable.name,
      description: orgGroupsTable.description,
      archivedAt: orgGroupsTable.archivedAt,
      createdAt: orgGroupsTable.createdAt,
      memberCount: sql<number>`(SELECT count(*)::int FROM org_group_members gm WHERE gm.group_id = ${orgGroupsTable.id})`,
      leadCount: sql<number>`(SELECT count(*)::int FROM org_group_members gm WHERE gm.group_id = ${orgGroupsTable.id} AND gm.role = 'lead')`,
      iLead: sql<boolean>`EXISTS (SELECT 1 FROM org_group_members gm WHERE gm.group_id = ${orgGroupsTable.id} AND gm.user_id = ${req.user!.id} AND gm.role = 'lead')`,
    })
    .from(orgGroupsTable)
    .where(eq(orgGroupsTable.orgId, me.orgId))
    .orderBy(asc(orgGroupsTable.name));
  const visible = isManager ? rows : rows.filter((g) => g.iLead && !g.archivedAt);
  if (!isManager && visible.length === 0) {
    res.status(403).json({ error: "Only organisation managers and group leads can manage groups." });
    return;
  }
  res.json({ groups: visible, canManage: isManager });
});

router.post("/groups", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (me?.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can create groups." });
    return;
  }
  const name = cleanGroupName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Give the group a name of up to 80 characters." });
    return;
  }
  if (await nameTaken(me.orgId, name)) {
    res.status(409).json({ error: NAME_TAKEN });
    return;
  }
  const group = { id: randomUUID(), orgId: me.orgId, name, description: cleanDescription(req.body?.description) ?? null };
  try {
    await db.insert(orgGroupsTable).values(group);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: NAME_TAKEN });
      return;
    }
    throw err;
  }
  await audit(me.orgId, req.user!.id, "group_created", group.id, { name });
  res.status(201).json({ group });
});

router.patch("/groups/:groupId", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (me?.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can change groups." });
    return;
  }
  const group = await groupInOrg(String(req.params.groupId), me.orgId);
  if (!group) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  const changes: Partial<typeof orgGroupsTable.$inferInsert> = {};
  if (req.body?.name !== undefined) {
    const name = cleanGroupName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Give the group a name of up to 80 characters." });
      return;
    }
    if (await nameTaken(me.orgId, name, group.id)) {
      res.status(409).json({ error: NAME_TAKEN });
      return;
    }
    changes.name = name;
  }
  const description = cleanDescription(req.body?.description);
  if (description !== undefined) changes.description = description;
  if (typeof req.body?.archived === "boolean") changes.archivedAt = req.body.archived ? new Date() : null;
  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "Nothing to change." });
    return;
  }
  try {
    const [updated] = await db.update(orgGroupsTable).set(changes).where(eq(orgGroupsTable.id, group.id)).returning();
    await audit(me.orgId, req.user!.id, "group_updated", group.id, {
      ...(changes.name ? { name: changes.name } : {}),
      ...("archivedAt" in changes ? { archived: changes.archivedAt !== null } : {}),
    });
    res.json({ group: updated });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: NAME_TAKEN });
      return;
    }
    throw err;
  }
});

// Every active group membership in the organisation, for the Members list
// in Settings (managers only).
router.get("/groups/memberships", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (me?.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can see group memberships." });
    return;
  }
  const memberships = await db
    .select({
      userId: orgGroupMembersTable.userId,
      groupId: orgGroupsTable.id,
      groupName: orgGroupsTable.name,
      role: orgGroupMembersTable.role,
    })
    .from(orgGroupMembersTable)
    .innerJoin(orgGroupsTable, eq(orgGroupsTable.id, orgGroupMembersTable.groupId))
    .where(and(eq(orgGroupsTable.orgId, me.orgId), isNull(orgGroupsTable.archivedAt)))
    .orderBy(asc(orgGroupsTable.name));
  res.json({ memberships });
});

/** What planGroupImport needs to know about the organisation and the people in a list. */
async function importContext(orgId: string, rows: ImportRow[]) {
  const emails = [...new Set(rows.map((r) => (typeof r.email === "string" ? r.email.trim().toLowerCase() : "")).filter(Boolean))];
  const [groups, org] = await Promise.all([
    db.select({ id: orgGroupsTable.id, name: orgGroupsTable.name, archivedAt: orgGroupsTable.archivedAt })
      .from(orgGroupsTable)
      .where(eq(orgGroupsTable.orgId, orgId)),
    db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId), columns: { allowedDomain: true } }),
  ]);
  const users = emails.length === 0 ? [] : await db
    .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
    .from(usersTable)
    .where(inArray(sql`lower(${usersTable.email})`, emails));
  const userIds = users.map((u) => u.id);
  // inArray needs at least one value; an empty list matches nobody.
  const ids = userIds.length > 0 ? userIds : [""];
  const [memberships, deactivated, groupMemberships, invites] = await Promise.all([
    db.select({ userId: orgMembersTable.userId, status: orgMembersTable.status })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, orgId), inArray(orgMembersTable.userId, ids))),
    db.select({ userId: orgDeactivatedMembersTable.userId })
      .from(orgDeactivatedMembersTable)
      .where(and(eq(orgDeactivatedMembersTable.orgId, orgId), inArray(orgDeactivatedMembersTable.userId, ids))),
    db.select({ groupId: orgGroupMembersTable.groupId, userId: orgGroupMembersTable.userId, role: orgGroupMembersTable.role })
      .from(orgGroupMembersTable)
      .innerJoin(orgGroupsTable, eq(orgGroupsTable.id, orgGroupMembersTable.groupId))
      .where(and(eq(orgGroupsTable.orgId, orgId), inArray(orgGroupMembersTable.userId, ids))),
    db.select({ email: orgInvitesTable.email })
      .from(orgInvitesTable)
      .where(and(eq(orgInvitesTable.orgId, orgId), inArray(orgInvitesTable.email, emails.length > 0 ? emails : [""]))),
  ]);
  const statusOf = new Map(memberships.map((m) => [m.userId, m.status]));
  const deactivatedIds = new Set(deactivated.map((d) => d.userId));
  const people = new Map(users.map((u) => {
    const status = statusOf.get(u.id);
    return [u.email.trim().toLowerCase(), {
      userId: u.id,
      name: u.displayName ?? u.email,
      status: deactivatedIds.has(u.id) ? "deactivated" as const
        : status === "active" ? "active" as const
        : status === "pending" ? "pending" as const
        : null,
    }];
  }));
  return {
    groups: groups.map((g) => ({ id: g.id, name: g.name, archived: g.archivedAt !== null })),
    people,
    memberships: new Map(groupMemberships.map((m) => [`${m.groupId}:${m.userId}`, (isGroupRole(m.role) ? m.role : "member") as GroupRole])),
    pendingInvites: new Set(invites.map((i) => i.email)),
    allowedDomains: parseAllowedDomains(org?.allowedDomain),
  };
}

// Checking a list is free; carrying one out can send many invites, so it's limited.
const importLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "You've added several lists in the last hour. Please try again later.",
  skip: (req) => (req.body as { dryRun?: unknown } | undefined)?.dryRun !== false,
});

/**
 * Adds people to groups from a list of rows { email, group, role? }. With
 * dryRun (the default) it only says what would happen. Otherwise it creates
 * groups that don't exist yet, adds active members, saves places for people
 * who aren't active members yet, and invites the rest.
 */
router.post("/groups/import", authenticate, importLimiter, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (me?.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can add people to groups." });
    return;
  }
  const raw: unknown = req.body?.rows;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IMPORT_ROWS) {
    res.status(400).json({ error: `Send a list of 1 to ${MAX_IMPORT_ROWS} rows.` });
    return;
  }
  const rows = raw.map((r) => (r && typeof r === "object" ? r : {}) as ImportRow);
  const ctx = await importContext(me.orgId, rows);
  const plan: ImportPlan = planGroupImport(rows, ctx);
  if (req.body?.dryRun !== false) {
    res.json({ plan, done: false });
    return;
  }

  const groupIds = new Map(ctx.groups.map((g) => [g.name.toLowerCase(), g.id]));
  for (const name of plan.newGroups) {
    const id = randomUUID();
    const created = await db.insert(orgGroupsTable).values({ id, orgId: me.orgId, name }).onConflictDoNothing().returning({ id: orgGroupsTable.id });
    if (created.length > 0) {
      groupIds.set(name.toLowerCase(), id);
      await audit(me.orgId, req.user!.id, "group_created", id, { name, fromList: true });
    } else {
      const existing = await db.query.orgGroupsTable.findFirst({
        where: and(eq(orgGroupsTable.orgId, me.orgId), eq(orgGroupsTable.name, name)),
        columns: { id: true },
      });
      if (existing) groupIds.set(name.toLowerCase(), existing.id);
    }
  }
  const idOf = (group: string) => groupIds.get(group.toLowerCase());

  const additions = new Map<string, { groupId: string; role: GroupRole; userIds: string[] }>();
  for (const a of plan.add) {
    const groupId = idOf(a.group);
    if (!groupId) continue;
    const key = `${groupId}:${a.role}`;
    const entry = additions.get(key) ?? { groupId, role: a.role, userIds: [] };
    entry.userIds.push(a.userId);
    additions.set(key, entry);
  }
  for (const { groupId, role, userIds } of additions.values()) {
    await addToGroup(groupId, userIds, role);
  }

  const savedNames = new Map<string, string[]>();
  for (const s of plan.save) {
    const groupId = idOf(s.group);
    if (!groupId) continue;
    await savePendingPlacements(me.orgId, s.email, [{ groupId, role: s.role }]);
    savedNames.set(s.email, [...(savedNames.get(s.email) ?? []), s.group]);
  }
  await sendInvitesInBackground(
    me.orgId,
    req.user!.id,
    plan.invite.map((email) => ({ email, groupNames: savedNames.get(email) ?? [] })),
  );

  await audit(me.orgId, req.user!.id, "group_list_added", "list", {
    rows: rows.length,
    added: plan.add.length,
    saved: plan.save.length,
    invited: plan.invite.length,
    newGroups: plan.newGroups.length,
  });
  res.json({ plan, done: true });
});

router.get("/groups/:groupId/members", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  const group = me ? await groupInOrg(String(req.params.groupId), me.orgId) : null;
  if (!me || !group) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  const isManager = me.role === "manager";
  const lead = await db.query.orgGroupMembersTable.findFirst({
    where: and(
      eq(orgGroupMembersTable.groupId, group.id),
      eq(orgGroupMembersTable.userId, req.user!.id),
      eq(orgGroupMembersTable.role, "lead"),
    ),
  });
  if (!isManager && !lead) {
    res.status(403).json({ error: "Only organisation managers and this group's leads can see its members." });
    return;
  }
  const members = await db
    .select({
      userId: orgGroupMembersTable.userId,
      displayName: usersTable.displayName,
      email: usersTable.email,
      role: orgGroupMembersTable.role,
      joinedAt: orgGroupMembersTable.joinedAt,
    })
    .from(orgGroupMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, orgGroupMembersTable.userId))
    .where(eq(orgGroupMembersTable.groupId, group.id))
    .orderBy(asc(usersTable.displayName));
  // Leads are members themselves: they see names, not email addresses.
  res.json({
    group,
    members: isManager ? members : members.map(({ email: _email, ...rest }) => rest),
  });
});

router.post("/groups/:groupId/members", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (me?.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can add people to groups." });
    return;
  }
  const group = await groupInOrg(String(req.params.groupId), me.orgId);
  if (!group || group.archivedAt) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  // One person (userId), or several at once (userIds).
  const rawIds: unknown[] = Array.isArray(req.body?.userIds) ? req.body.userIds : [req.body?.userId];
  const userIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id !== ""))];
  const role = req.body?.role === undefined ? "member" : req.body.role;
  if (!isGroupRole(role)) {
    res.status(400).json({ error: "role must be member or lead." });
    return;
  }
  if (userIds.length === 0 || userIds.length > MAX_IMPORT_ROWS) {
    res.status(400).json({ error: `Choose between 1 and ${MAX_IMPORT_ROWS} people.` });
    return;
  }
  const targets = await db
    .select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .where(and(inArray(orgMembersTable.userId, userIds), eq(orgMembersTable.orgId, me.orgId), eq(orgMembersTable.status, "active")));
  if (targets.length !== userIds.length) {
    res.status(400).json({ error: "Only active members of your organisation can join its groups." });
    return;
  }
  if (role === "member" && userIds.length === 1) {
    // One person gets the role asked for, so a lead can be made a member
    // again. Adding several leaves their leads as leads.
    await db
      .update(orgGroupMembersTable)
      .set({ role })
      .where(and(eq(orgGroupMembersTable.groupId, group.id), eq(orgGroupMembersTable.userId, userIds[0]!)));
  }
  await addToGroup(group.id, userIds, role);
  for (const userId of userIds) {
    await audit(me.orgId, req.user!.id, "group_member_added", group.id, { userId, role });
  }
  res.status(201).json({ ok: true, added: userIds.length });
});

router.patch("/groups/:groupId/members/:userId", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (me?.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can change group roles." });
    return;
  }
  const group = await groupInOrg(String(req.params.groupId), me.orgId);
  if (!group) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  const role = req.body?.role;
  if (!isGroupRole(role)) {
    res.status(400).json({ error: "role must be member or lead." });
    return;
  }
  const updated = await db
    .update(orgGroupMembersTable)
    .set({ role })
    .where(and(eq(orgGroupMembersTable.groupId, group.id), eq(orgGroupMembersTable.userId, String(req.params.userId))))
    .returning();
  if (updated.length === 0) {
    res.status(404).json({ error: "That person is not in this group." });
    return;
  }
  await audit(me.orgId, req.user!.id, "group_role_changed", group.id, { userId: req.params.userId, role });
  res.json({ ok: true });
});

router.delete("/groups/:groupId/members/:userId", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (me?.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can remove people from groups." });
    return;
  }
  const group = await groupInOrg(String(req.params.groupId), me.orgId);
  if (!group) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  await db
    .delete(orgGroupMembersTable)
    .where(and(eq(orgGroupMembersTable.groupId, group.id), eq(orgGroupMembersTable.userId, String(req.params.userId))));
  await audit(me.orgId, req.user!.id, "group_member_removed", group.id, { userId: req.params.userId });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

router.get("/my/groups", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  if (!me) {
    res.json({ groups: [] });
    return;
  }
  const groups = await db
    .select({
      id: orgGroupsTable.id,
      name: orgGroupsTable.name,
      description: orgGroupsTable.description,
      role: orgGroupMembersTable.role,
    })
    .from(orgGroupsTable)
    .leftJoin(
      orgGroupMembersTable,
      and(eq(orgGroupMembersTable.groupId, orgGroupsTable.id), eq(orgGroupMembersTable.userId, req.user!.id)),
    )
    .where(and(eq(orgGroupsTable.orgId, me.orgId), isNull(orgGroupsTable.archivedAt)))
    .orderBy(asc(orgGroupsTable.name));
  res.json({ groups: groups.map((g) => ({ ...g, joined: g.role !== null })) });
});

router.post("/my/groups/:groupId/join", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  const group = me ? await groupInOrg(String(req.params.groupId), me.orgId) : null;
  if (!me || !group || group.archivedAt) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  await db.insert(orgGroupMembersTable).values({ groupId: group.id, userId: req.user!.id }).onConflictDoNothing();
  await joinGroupChallenges([req.user!.id], [group.id]);
  res.json({ ok: true });
});

router.post("/my/groups/:groupId/leave", authenticate, async (req: AuthenticatedRequest, res) => {
  const me = await activeMembership(req.user!.id);
  const group = me ? await groupInOrg(String(req.params.groupId), me.orgId) : null;
  if (!me || !group) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  // Activities already counted for the group stay with it.
  await db
    .delete(orgGroupMembersTable)
    .where(and(eq(orgGroupMembersTable.groupId, group.id), eq(orgGroupMembersTable.userId, req.user!.id)));
  res.json({ ok: true });
});

/** Parses `groupId` from a body: a string id, or null for "no group". */
function parseGroupChoice(raw: unknown): string | null | undefined {
  if (raw === null) return null;
  return typeof raw === "string" && raw ? raw : undefined;
}

router.patch("/my/records/:recordId/group", authenticate, async (req: AuthenticatedRequest, res) => {
  const recordId = Number(req.params.recordId);
  const groupId = parseGroupChoice(req.body?.groupId);
  if (!Number.isInteger(recordId) || groupId === undefined) {
    res.status(400).json({ error: "Send groupId: a group id, or null for no group." });
    return;
  }
  if (groupId && !(await canUseGroup(req.user!.id, groupId))) {
    res.status(400).json({ error: "You can only count activities for groups you are in." });
    return;
  }
  if (!(await setRecordGroup(req.user!.id, recordId, groupId))) {
    res.status(404).json({ error: "Activity not found." });
    return;
  }
  res.json({ ok: true, groupId });
});

router.patch("/my/templates/:templateId/group", authenticate, async (req: AuthenticatedRequest, res) => {
  const templateId = Number(req.params.templateId);
  const groupId = parseGroupChoice(req.body?.groupId);
  if (!Number.isInteger(templateId) || groupId === undefined) {
    res.status(400).json({ error: "Send groupId: a group id, or null for no group." });
    return;
  }
  if (groupId && !(await canUseGroup(req.user!.id, groupId))) {
    res.status(400).json({ error: "You can only count activities for groups you are in." });
    return;
  }
  if (!(await setTemplateGroup(req.user!.id, templateId, groupId))) {
    res.status(404).json({ error: "Regular activity not found." });
    return;
  }
  res.json({ ok: true, groupId });
});

export default router;
