import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db, orgGroupsTable, orgGroupMembersTable, orgMembersTable, orgAuditLogTable, usersTable } from "@workspace/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import {
  GROUP_DESCRIPTION_MAX,
  canUseGroup,
  cleanGroupName,
  isGroupRole,
  setRecordGroup,
  setTemplateGroup,
} from "../lib/orgGroups.js";

/**
 * Organisation groups (lib/orgGroups.ts). Mounted at /org.
 *
 * Managers: create, rename, archive groups; add and remove members; make
 * someone a lead. Members: see their organisation's groups, join and leave,
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
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  const role = req.body?.role === undefined ? "member" : req.body.role;
  if (!isGroupRole(role)) {
    res.status(400).json({ error: "role must be member or lead." });
    return;
  }
  const target = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.orgId, me.orgId), eq(orgMembersTable.status, "active")),
  });
  if (!target) {
    res.status(400).json({ error: "Only active members of your organisation can join its groups." });
    return;
  }
  await db
    .insert(orgGroupMembersTable)
    .values({ groupId: group.id, userId, role })
    .onConflictDoUpdate({ target: [orgGroupMembersTable.groupId, orgGroupMembersTable.userId], set: { role } });
  await audit(me.orgId, req.user!.id, "group_member_added", group.id, { userId, role });
  res.status(201).json({ ok: true });
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
