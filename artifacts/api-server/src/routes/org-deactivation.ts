import { Router, type IRouter } from "express";
import {
  challengeParticipantsTable,
  challengesTable,
  db,
  organisationsTable,
  orgAuditLogTable,
  orgDeactivatedMembersTable,
  orgGroupMembersTable,
  orgGroupsTable,
  orgMemberConsentsTable,
  orgMembersTable,
  usersTable,
} from "@workspace/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { lockMembershipChanges } from "../lib/orgDeactivation.js";
import { requireOrgManager } from "../lib/orgManager.js";
import { getUncachableResendClient } from "../lib/resend.js";

/**
 * Deactivating members (see orgDeactivatedMembersTable). Mounted at /org.
 *
 * Managers: deactivate an active member, see who is deactivated, reactivate
 * them. Deactivated people: see which organisations deactivated them and
 * withdraw their hours, which they could otherwise do by leaving.
 */
const router: IRouter = Router();

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function writeAuditLog(orgId: string, actorUserId: string, action: string, targetId: string, metadata: Record<string, unknown>) {
  await db.insert(orgAuditLogTable).values({ orgId, actorUserId, action, targetType: "member", targetId, metadata })
    .catch(err => console.error(`[org.deactivation] failed to write ${action} audit log:`, err));
}

/** Emails the member without holding up the response. */
function emailMember(userId: string, orgId: string, subject: (orgName: string) => string, paragraphs: (orgName: string) => string[]) {
  (async () => {
    try {
      const [user, org] = await Promise.all([
        db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) }),
        db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) }),
      ]);
      if (!user?.email) return;
      const orgName = org?.name ?? "your organisation";
      const { client, fromEmail } = await getUncachableResendClient("organisation");
      const { error } = await client.emails.send({
        from: fromEmail,
        to: user.email,
        subject: subject(orgName),
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
            ${paragraphs(orgName).map(p => `<p style="color:#444;font-size:15px;line-height:1.5;">${escHtml(p)}</p>`).join("")}
            <p style="color:#aaa;font-size:11px;margin-top:32px;">My Impact · myimpact.uk</p>
          </div>
        `,
      });
      if (error) console.error("[org.deactivation] Resend rejected email:", error);
    } catch (err) {
      console.error("[org.deactivation] failed to send email:", err);
    }
  })();
}

router.get("/my/members/deactivated", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const rows = await db
    .select({
      userId: orgDeactivatedMembersTable.userId,
      role: orgDeactivatedMembersTable.role,
      deactivatedAt: orgDeactivatedMembersTable.deactivatedAt,
      hoursWithdrawnAt: orgDeactivatedMembersTable.hoursWithdrawnAt,
      displayName: usersTable.displayName,
      email: usersTable.email,
    })
    .from(orgDeactivatedMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, orgDeactivatedMembersTable.userId))
    .where(eq(orgDeactivatedMembersTable.orgId, membership.orgId))
    .orderBy(asc(orgDeactivatedMembersTable.deactivatedAt));

  res.json({
    members: rows.map(r => ({
      userId: r.userId,
      name: r.displayName ?? r.email,
      email: r.email,
      role: r.role,
      deactivatedAt: r.deactivatedAt.toISOString(),
      hoursWithdrawn: !!r.hoursWithdrawnAt,
    })),
  });
});

router.post("/my/members/:userId/deactivate", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;
  const { orgId } = membership;

  const userId = String(req.params.userId);
  if (userId === req.user!.id) {
    res.status(409).json({ error: "You can't deactivate yourself. Use Leave organisation in your settings." });
    return;
  }

  const target = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)),
  });
  if (!target) { res.status(404).json({ error: "Member not found." }); return; }
  if (target.status !== "active") {
    res.status(409).json({ error: "Only active members can be deactivated. Pending requests can be rejected." });
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    await lockMembershipChanges(tx, userId);
    // Locked so two managers deactivating each other can't leave none.
    const managers = await tx
      .select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.role, "manager"), eq(orgMembersTable.status, "active")))
      .for("update");
    if (managers.length === 1 && managers[0].userId === userId) return "last_manager" as const;

    const removed = await tx
      .delete(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
      .returning({ role: orgMembersTable.role, joinedAt: orgMembersTable.joinedAt });
    const member = removed[0];
    if (!member) return "gone" as const;

    const groups = await tx
      .select({ groupId: orgGroupMembersTable.groupId, role: orgGroupMembersTable.role })
      .from(orgGroupMembersTable)
      .innerJoin(orgGroupsTable, eq(orgGroupsTable.id, orgGroupMembersTable.groupId))
      .where(and(eq(orgGroupMembersTable.userId, userId), eq(orgGroupsTable.orgId, orgId)));
    if (groups.length > 0) {
      await tx.delete(orgGroupMembersTable).where(and(
        eq(orgGroupMembersTable.userId, userId),
        inArray(orgGroupMembersTable.groupId, groups.map(g => g.groupId)),
      ));
    }

    // In a consented organisation nothing of theirs counts once consent has gone.
    const org = await tx.query.organisationsTable.findFirst({
      where: eq(organisationsTable.id, orgId),
      columns: { dataSharingMode: true },
    });
    const consent = await tx.query.orgMemberConsentsTable.findFirst({
      where: and(
        eq(orgMemberConsentsTable.orgId, orgId),
        eq(orgMemberConsentsTable.userId, userId),
        eq(orgMemberConsentsTable.status, "active"),
      ),
      columns: { id: true },
    });
    const hoursGone = org?.dataSharingMode === "consented_logging" && !consent;

    await tx.insert(orgDeactivatedMembersTable).values({
      orgId,
      userId,
      role: member.role,
      joinedAt: member.joinedAt,
      groups,
      hoursWithdrawnAt: hoursGone ? new Date() : null,
    });
    return hoursGone ? "deactivated_without_hours" as const : "deactivated" as const;
  });

  if (outcome === "last_manager") {
    res.status(409).json({ error: "An organisation must always have at least one manager. Promote someone else first." });
    return;
  }
  if (outcome === "gone") { res.status(404).json({ error: "Member not found." }); return; }

  await writeAuditLog(orgId, req.user!.id, "member.deactivated", userId, { role: target.role });
  emailMember(
    userId,
    orgId,
    orgName => `Your membership of ${orgName} has been deactivated`,
    orgName => [
      `A manager at ${orgName} has deactivated your membership, so you no longer have access to its pages or groups.`,
      "Your My Impact account and activity history are yours and haven't changed.",
      ...(outcome === "deactivated"
        ? [`Hours you logged while you were a member still count towards ${orgName}'s totals. You can remove them at any time from Settings in My Impact.`]
        : []),
      "If you think this was a mistake, please get in touch with the organisation directly.",
    ],
  );

  res.json({ ok: true });
});

router.post("/my/members/:userId/reactivate", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;
  const { orgId } = membership;

  const userId = String(req.params.userId);
  const thisRow = and(eq(orgDeactivatedMembersTable.orgId, orgId), eq(orgDeactivatedMembersTable.userId, userId));

  const outcome = await db.transaction(async (tx) => {
    await lockMembershipChanges(tx, userId);
    // Locked so a withdrawal arriving now waits, and then finds nothing to withdraw.
    const [row] = await tx.select().from(orgDeactivatedMembersTable).where(thisRow).for("update");
    if (!row) return { result: "not_found" as const };

    const elsewhere = await tx.query.orgMembersTable.findFirst({ where: eq(orgMembersTable.userId, userId) });
    if (elsewhere) return { result: "elsewhere" as const };

    // They took their hours back, so sharing them again is their choice: the
    // manager can only let them rejoin.
    if (row.hoursWithdrawnAt) {
      await tx.delete(orgDeactivatedMembersTable).where(thisRow);
      return { result: "rejoin_allowed" as const, role: row.role };
    }

    await tx.insert(orgMembersTable).values({ orgId, userId, role: row.role, status: "active", joinedAt: row.joinedAt });
    if (row.groups.length > 0) {
      // Skips any group deleted in the meantime.
      const stillThere = await tx
        .select({ id: orgGroupsTable.id })
        .from(orgGroupsTable)
        .where(and(eq(orgGroupsTable.orgId, orgId), inArray(orgGroupsTable.id, row.groups.map(g => g.groupId))));
      const ids = new Set(stillThere.map(g => g.id));
      const groups = row.groups.filter(g => ids.has(g.groupId));
      if (groups.length > 0) {
        await tx.insert(orgGroupMembersTable).values(groups.map(g => ({ groupId: g.groupId, userId, role: g.role }))).onConflictDoNothing();
      }
    }
    await tx.delete(orgDeactivatedMembersTable).where(thisRow);
    return { result: "reactivated" as const, role: row.role };
  });

  if (outcome.result === "not_found") { res.status(404).json({ error: "Deactivated member not found." }); return; }
  if (outcome.result === "elsewhere") {
    res.status(409).json({ error: "This person has since joined another organisation, so they can't be reactivated." });
    return;
  }
  if (outcome.result === "rejoin_allowed") {
    await writeAuditLog(orgId, req.user!.id, "member.rejoin_allowed", userId, { role: outcome.role });
    res.json({ ok: true, rejoinAllowed: true });
    return;
  }

  await writeAuditLog(orgId, req.user!.id, "member.reactivated", userId, { role: outcome.role });
  emailMember(
    userId,
    orgId,
    orgName => `Your membership of ${orgName} has been reactivated`,
    orgName => [`A manager at ${orgName} has reactivated your membership, so you have access to its pages and groups again.`],
  );

  res.json({ ok: true });
});

router.get("/deactivations", authenticate, async (req: AuthenticatedRequest, res) => {
  const rows = await db
    .select({
      orgId: orgDeactivatedMembersTable.orgId,
      orgName: organisationsTable.name,
      deactivatedAt: orgDeactivatedMembersTable.deactivatedAt,
      hoursWithdrawnAt: orgDeactivatedMembersTable.hoursWithdrawnAt,
    })
    .from(orgDeactivatedMembersTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, orgDeactivatedMembersTable.orgId))
    .where(eq(orgDeactivatedMembersTable.userId, req.user!.id));

  res.json({
    deactivations: rows.map(r => ({
      orgId: r.orgId,
      orgName: r.orgName,
      deactivatedAt: r.deactivatedAt.toISOString(),
      hoursWithdrawn: !!r.hoursWithdrawnAt,
    })),
  });
});

router.post("/deactivations/:orgId/withdraw-hours", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const orgId = String(req.params.orgId);

  const withdrawnAt = new Date();
  const withdrawn = await db.transaction(async (tx) => {
    const updated = await tx
      .update(orgDeactivatedMembersTable)
      .set({ hoursWithdrawnAt: withdrawnAt })
      .where(and(
        eq(orgDeactivatedMembersTable.orgId, orgId),
        eq(orgDeactivatedMembersTable.userId, userId),
        isNull(orgDeactivatedMembersTable.hoursWithdrawnAt),
      ))
      .returning({ userId: orgDeactivatedMembersTable.userId });
    if (updated.length === 0) return false;

    await tx.update(orgMemberConsentsTable)
      .set({ status: "withdrawn", withdrawnAt })
      .where(and(
        eq(orgMemberConsentsTable.orgId, orgId),
        eq(orgMemberConsentsTable.userId, userId),
        eq(orgMemberConsentsTable.status, "active"),
      ));
    await tx.delete(challengeParticipantsTable).where(and(
      eq(challengeParticipantsTable.userId, userId),
      inArray(
        challengeParticipantsTable.challengeId,
        tx.select({ id: challengesTable.id }).from(challengesTable).where(eq(challengesTable.orgId, orgId)),
      ),
    ));
    return true;
  });
  if (!withdrawn) {
    res.status(404).json({ error: "There are no hours to withdraw from this organisation." });
    return;
  }

  await writeAuditLog(orgId, userId, "member.hours_withdrawn", userId, { withdrawnAt: withdrawnAt.toISOString() });

  res.json({ ok: true });
});

export default router;
