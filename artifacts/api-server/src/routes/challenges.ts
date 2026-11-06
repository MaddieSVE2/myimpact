import { Router, type IRouter } from "express";
import {
  db,
  challengesTable,
  challengeGroupsTable,
  challengeParticipantsTable,
  impactRecordsTable,
  orgDeactivatedMembersTable,
  orgGroupsTable,
  orgMembersTable,
  organisationsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, gte, lte, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import crypto from "crypto";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";
import { isDeactivatedFrom } from "../lib/orgDeactivation.js";
import { AUDIENCE_ERROR, activeGroupIdsFor, activeMembersOfGroups, parseAudience } from "../lib/orgGroups.js";
import {
  getOrgSharingContext,
  sharedRecordsCondition,
  type OrgSharingContext,
} from "../lib/orgSharing.js";

const router: IRouter = Router();

const GOAL_TYPES = ["social_value", "hours"] as const;
type GoalType = (typeof GOAL_TYPES)[number];

const SCOPES = ["personal", "org"] as const;
type Scope = (typeof SCOPES)[number];

/** A deactivated member loses their organisation's challenges, even one they set up. */
async function deactivatedFromChallengeOrg(challenge: typeof challengesTable.$inferSelect, userId: string): Promise<boolean> {
  return challenge.scope === "org" && !!challenge.orgId && isDeactivatedFrom(challenge.orgId, userId);
}

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

interface ParsedResult {
  totalValue: number;
  totalHours: number;
}

function parseResult(raw: unknown): ParsedResult {
  if (raw === null || typeof raw !== "object") return { totalValue: 0, totalHours: 0 };
  const r = raw as Record<string, unknown>;
  return {
    totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
  };
}

async function getOrgManagerMembership(userId: string) {
  return await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.role, "manager"), eq(orgMembersTable.status, "active")),
  });
}

type ChallengeGroup = { id: string; name: string };

/** The groups each organisation challenge is for, by challenge id. None = everyone. */
async function challengeGroups(challengeIds: string[]): Promise<Map<string, ChallengeGroup[]>> {
  const byChallenge = new Map<string, ChallengeGroup[]>();
  if (challengeIds.length === 0) return byChallenge;
  const rows = await db
    .select({ challengeId: challengeGroupsTable.challengeId, id: orgGroupsTable.id, name: orgGroupsTable.name })
    .from(challengeGroupsTable)
    .innerJoin(orgGroupsTable, eq(orgGroupsTable.id, challengeGroupsTable.groupId))
    .where(inArray(challengeGroupsTable.challengeId, challengeIds))
    .orderBy(asc(orgGroupsTable.name));
  for (const r of rows) byChallenge.set(r.challengeId, [...(byChallenge.get(r.challengeId) ?? []), { id: r.id, name: r.name }]);
  return byChallenge;
}

/**
 * Whether an active member of the challenge's organisation may see and join
 * it: managers always, others when it's for everyone or one of their groups.
 */
async function inChallengeAudience(challengeId: string, membership: { role: string }, userId: string): Promise<boolean> {
  if (membership.role === "manager") return true;
  const groups = (await challengeGroups([challengeId])).get(challengeId);
  if (!groups) return true;
  const mine = await activeGroupIdsFor(userId);
  return groups.some((g) => mine.includes(g.id));
}

async function ensureParticipant(challengeId: string, userId: string) {
  await db
    .insert(challengeParticipantsTable)
    .values({ challengeId, userId })
    .onConflictDoNothing();
}

async function listChallengeRecords(
  challenge: typeof challengesTable.$inferSelect,
  participantIds: string[],
  suppliedSharingCtx?: OrgSharingContext,
) {
  if (participantIds.length === 0) return [] as typeof impactRecordsTable.$inferSelect[];

  const conditions = [
    inArray(impactRecordsTable.userId, participantIds),
    gte(impactRecordsTable.entryDate, challenge.startDate),
    lte(impactRecordsTable.entryDate, challenge.endDate),
    lte(impactRecordsTable.createdAt, challenge.endDate),
  ];

  if (challenge.scope === "org" && challenge.orgId) {
    const sharingCtx = suppliedSharingCtx?.orgId === challenge.orgId
      ? suppliedSharingCtx
      : await getOrgSharingContext(challenge.orgId);

    // Manual-submission organisations only count activity deliberately
    // submitted to this organisation. For automatic-sharing organisations,
    // reuse the dashboard's canonical condition: active membership, consent
    // window, organisation boundary and personal/org twin exclusion.
    if (sharingCtx.mode === "explicit_submission") {
      conditions.push(eq(impactRecordsTable.submittedToOrgId, challenge.orgId));
    } else {
    const sharedCondition = sharedRecordsCondition(sharingCtx);
    if (!sharedCondition) return [];
    conditions.push(sharedCondition);
    }
  }

  return await db
    .select()
    .from(impactRecordsTable)
    .where(and(...conditions));
}

async function computeProgress(
  challenge: typeof challengesTable.$inferSelect,
  participantIds: string[],
  suppliedSharingCtx?: OrgSharingContext,
) {
  const records = await listChallengeRecords(challenge, participantIds, suppliedSharingCtx);

  const perUser: Record<string, { value: number; hours: number }> = {};
  for (const id of participantIds) perUser[id] = { value: 0, hours: 0 };

  for (const r of records) {
    const parsed = parseResult(r.resultJson);
    if (!perUser[r.userId]) perUser[r.userId] = { value: 0, hours: 0 };
    perUser[r.userId].value += parsed.totalValue;
    perUser[r.userId].hours += parsed.totalHours;
  }

  let total = 0;
  const leaderboard: Array<{ userId: string; value: number; hours: number; contribution: number }> = [];
  for (const userId of participantIds) {
    const stats = perUser[userId] ?? { value: 0, hours: 0 };
    const contribution = challenge.goalType === "hours" ? stats.hours : stats.value;
    total += contribution;
    leaderboard.push({ userId, value: stats.value, hours: stats.hours, contribution });
  }

  leaderboard.sort((a, b) => b.contribution - a.contribution);

  const target = Number(challenge.target);
  const percent = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;

  return {
    total: Math.round(total * 100) / 100,
    target,
    percent,
    leaderboard,
    contributingRecordIds: records.map((r) => String(r.id)),
  };
}

async function attachUserDisplay(
  leaderboard: Array<{ userId: string; value: number; hours: number; contribution: number }>,
  selfUserId: string
) {
  if (leaderboard.length === 0) return [];
  const userIds = leaderboard.map((l) => l.userId);
  const users = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  const userMap = new Map(users.map((u) => [u.id, u]));
  return leaderboard.map((l, idx) => {
    const u = userMap.get(l.userId);
    const isMe = l.userId === selfUserId;
    const display =
      u?.displayName?.trim() ||
      (u?.email ? u.email.split("@")[0] : "Member");
    return {
      rank: idx + 1,
      userId: l.userId,
      displayName: isMe ? `${display} (you)` : display,
      isMe,
      value: Math.round(l.value * 100) / 100,
      hours: Math.round(l.hours * 100) / 100,
      contribution: Math.round(l.contribution * 100) / 100,
    };
  });
}

function serializeChallenge(c: typeof challengesTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    goalType: c.goalType,
    target: Number(c.target),
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    ownerId: c.ownerId ?? null,
    orgId: c.orgId ?? null,
    scope: c.scope,
    departmentTag: c.departmentTag ?? null,
    inviteCode: c.inviteCode,
    endSummarySentAt: c.endSummarySentAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    hasEnded: c.endDate.getTime() < Date.now(),
    hasStarted: c.startDate.getTime() <= Date.now(),
  };
}

router.post("/", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const body = req.body as Record<string, unknown>;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const goalType = typeof body.goalType === "string" ? body.goalType : "";
    const target = typeof body.target === "number" ? body.target : Number(body.target);
    const startRaw = typeof body.startDate === "string" ? body.startDate : "";
    const endRaw = typeof body.endDate === "string" ? body.endDate : "";
    const scope = typeof body.scope === "string" ? body.scope : "personal";
    const departmentTag = typeof body.departmentTag === "string" && body.departmentTag.trim()
      ? body.departmentTag.trim()
      : null;

    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    if (name.length > 120) { res.status(400).json({ error: "Name is too long (max 120 chars)" }); return; }
    if (!GOAL_TYPES.includes(goalType as GoalType)) {
      res.status(400).json({ error: "Goal type must be 'social_value' or 'hours'" }); return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      res.status(400).json({ error: "Target must be a positive number" }); return;
    }
    if (!SCOPES.includes(scope as Scope)) {
      res.status(400).json({ error: "Scope must be 'personal' or 'org'" }); return;
    }
    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({ error: "Invalid start or end date" }); return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      res.status(400).json({ error: "End date must be after start date" }); return;
    }

    let orgId: string | null = null;
    let groupIds: string[] = [];
    if (scope === "org") {
      const membership = await getOrgManagerMembership(userId);
      if (!membership) {
        res.status(403).json({ error: "Only organisation managers can create org challenges" }); return;
      }
      orgId = membership.orgId;
      const audience = await parseAudience(orgId, body.groupIds);
      if (!audience) { res.status(400).json({ error: AUDIENCE_ERROR }); return; }
      groupIds = audience;
    }

    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db.query.challengesTable.findFirst({
        where: eq(challengesTable.inviteCode, inviteCode),
      });
      if (!existing) break;
      inviteCode = generateInviteCode();
    }

    const id = randomUUID();
    const [created] = await db
      .insert(challengesTable)
      .values({
        id,
        name,
        description: description || null,
        goalType,
        target: String(target),
        startDate,
        endDate,
        ownerId: scope === "personal" ? userId : null,
        orgId,
        scope,
        departmentTag,
        inviteCode,
      })
      .returning();

    if (scope === "personal") {
      await ensureParticipant(id, userId);
    } else if (scope === "org" && orgId) {
      // A challenge for chosen groups is for their members, and for people
      // who join them later (lib/orgGroups.ts joinGroupChallenges).
      if (groupIds.length > 0) {
        await db.insert(challengeGroupsTable).values(groupIds.map((groupId) => ({ challengeId: id, groupId })));
      }
      const memberIds = groupIds.length > 0
        ? await activeMembersOfGroups(orgId, groupIds)
        : (await db.query.orgMembersTable.findMany({
          where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")),
        })).map((m) => m.userId);
      if (memberIds.length > 0) {
        await db
          .insert(challengeParticipantsTable)
          .values(memberIds.map((memberId) => ({ challengeId: id, userId: memberId })))
          .onConflictDoNothing();
      }
    }

    res.json({ challenge: { ...serializeChallenge(created), groups: (await challengeGroups([id])).get(id) ?? [] } });
  } catch (err) {
    console.error("Create challenge error:", err);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.get("/org", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const membership = await db.query.orgMembersTable.findFirst({
      where: and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")),
    });
    if (!membership) { res.status(404).json({ error: "You are not a member of any organisation." }); return; }
    const orgId = membership.orgId;

    const orgChallenges = await db
      .select()
      .from(challengesTable)
      .where(and(eq(challengesTable.scope, "org"), eq(challengesTable.orgId, orgId)))
      .orderBy(desc(challengesTable.startDate));

    if (orgChallenges.length === 0) { res.json({ challenges: [] }); return; }
    const sharingCtx = await getOrgSharingContext(orgId);

    const allIds = orgChallenges.map(c => c.id);
    const allParts = await db
      .select({ challengeId: challengeParticipantsTable.challengeId, userId: challengeParticipantsTable.userId })
      .from(challengeParticipantsTable)
      .where(inArray(challengeParticipantsTable.challengeId, allIds));

    const partsMap: Record<string, string[]> = {};
    const enrolledSet = new Set<string>();
    for (const p of allParts) {
      (partsMap[p.challengeId] ??= []).push(p.userId);
      if (p.userId === userId) enrolledSet.add(p.challengeId);
    }

    // Members see challenges for everyone, for their groups, and ones they
    // take part in; managers see them all.
    const groupsByChallenge = await challengeGroups(allIds);
    const myGroupIds = membership.role === "manager" ? [] : await activeGroupIdsFor(userId);
    const visible = orgChallenges.filter((c) => {
      const groups = groupsByChallenge.get(c.id);
      return membership.role === "manager" || !groups || enrolledSet.has(c.id) || groups.some((g) => myGroupIds.includes(g.id));
    });

    const now = Date.now();
    const summaries = await Promise.all(
      visible.map(async (c) => {
        const participantIds = partsMap[c.id] ?? [];
        const records = await listChallengeRecords(c, participantIds, sharingCtx);
        let total = 0;
        let mine = 0;
        for (const r of records) {
          const p = parseResult(r.resultJson);
          const contrib = c.goalType === "hours" ? p.totalHours : p.totalValue;
          total += contrib;
          if (r.userId === userId) mine += contrib;
        }
        const target = Number(c.target);
        const percent = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
        const hasEnded = c.endDate.getTime() < now;
        return {
          id: c.id,
          name: c.name,
          description: c.description,
          goalType: c.goalType as "social_value" | "hours",
          target,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate.toISOString(),
          orgId: c.orgId,
          groups: groupsByChallenge.get(c.id) ?? [],
          departmentTag: c.departmentTag ?? null,
          participantCount: participantIds.length,
          progressTotal: Math.round(total * 100) / 100,
          progressPercent: percent,
          myContribution: Math.round(mine * 100) / 100,
          isEnrolled: enrolledSet.has(c.id),
          hasEnded,
          isActive: !hasEnded && c.startDate.getTime() <= now,
        };
      }),
    );

    res.json({ challenges: summaries });
  } catch (err) {
    console.error("Org challenges error:", err);
    res.status(500).json({ error: "Failed to load challenges" });
  }
});

router.get("/mine", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const participantRows = await db
      .select({ challengeId: challengeParticipantsTable.challengeId })
      .from(challengeParticipantsTable)
      .where(eq(challengeParticipantsTable.userId, userId));

    const myChallengeIds = participantRows.map((r) => r.challengeId);

    const ownedRows = await db
      .select({ id: challengesTable.id })
      .from(challengesTable)
      .where(eq(challengesTable.ownerId, userId));
    for (const o of ownedRows) {
      if (!myChallengeIds.includes(o.id)) myChallengeIds.push(o.id);
    }

    if (myChallengeIds.length === 0) {
      res.json({ challenges: [] }); return;
    }

    const deactivatedFrom = new Set(
      (await db
        .select({ orgId: orgDeactivatedMembersTable.orgId })
        .from(orgDeactivatedMembersTable)
        .where(eq(orgDeactivatedMembersTable.userId, userId))).map((r) => r.orgId),
    );
    const challenges = (await db
      .select()
      .from(challengesTable)
      .where(inArray(challengesTable.id, myChallengeIds))
      .orderBy(desc(challengesTable.createdAt)))
      .filter((c) => !(c.scope === "org" && c.orgId && deactivatedFrom.has(c.orgId)));

    const now = Date.now();
    const allParticipantsByChallenge = await db
      .select({
        challengeId: challengeParticipantsTable.challengeId,
        userId: challengeParticipantsTable.userId,
      })
      .from(challengeParticipantsTable)
      .where(inArray(challengeParticipantsTable.challengeId, myChallengeIds));

    const partsMap: Record<string, string[]> = {};
    for (const row of allParticipantsByChallenge) {
      if (!partsMap[row.challengeId]) partsMap[row.challengeId] = [];
      partsMap[row.challengeId].push(row.userId);
    }
    const orgSharingContexts = new Map<string, OrgSharingContext>();
    await Promise.all(
      [...new Set(challenges.flatMap((challenge) => challenge.orgId ? [challenge.orgId] : []))]
        .map(async (orgId) => orgSharingContexts.set(orgId, await getOrgSharingContext(orgId)))
    );
    const groupsByChallenge = await challengeGroups(challenges.map((c) => c.id));

    const summaries = await Promise.all(
      challenges.map(async (c) => {
        const participantIds = partsMap[c.id] ?? [];
        const progress = await computeProgress(
          c,
          participantIds,
          c.orgId ? orgSharingContexts.get(c.orgId) : undefined,
        );
        return {
          ...serializeChallenge(c),
          groups: groupsByChallenge.get(c.id) ?? [],
          participantCount: participantIds.length,
          isOwner: c.ownerId === userId,
          progressTotal: progress.total,
          progressPercent: progress.percent,
          isActive: c.startDate.getTime() <= now && c.endDate.getTime() >= now,
        };
      })
    );

    res.json({ challenges: summaries });
  } catch (err) {
    console.error("List challenges error:", err);
    res.status(500).json({ error: "Failed to load challenges" });
  }
});

router.get("/by-code/:code", authenticate, async (req: AuthenticatedRequest, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  if (!code) { res.status(400).json({ error: "Invite code required" }); return; }

  const challenge = await db.query.challengesTable.findFirst({
    where: eq(challengesTable.inviteCode, code),
  });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

  const participantRows = await db
    .select({ userId: challengeParticipantsTable.userId })
    .from(challengeParticipantsTable)
    .where(eq(challengeParticipantsTable.challengeId, challenge.id));

  res.json({
    challenge: {
      ...serializeChallenge(challenge),
      participantCount: participantRows.length,
    },
  });
});

router.get("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = String(req.params.id);

    const challenge = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, id),
    });
    if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

    const participantRows = await db
      .select({ userId: challengeParticipantsTable.userId })
      .from(challengeParticipantsTable)
      .where(eq(challengeParticipantsTable.challengeId, id));
    const participantIds = participantRows.map((r) => r.userId);
    const isParticipant = participantIds.includes(userId);

    let canView = (isParticipant || challenge.ownerId === userId) && !(await deactivatedFromChallengeOrg(challenge, userId));
    if (!canView && challenge.scope === "org" && challenge.orgId) {
      const membership = await db.query.orgMembersTable.findFirst({
        where: and(
          eq(orgMembersTable.userId, userId),
          eq(orgMembersTable.orgId, challenge.orgId),
          eq(orgMembersTable.status, "active")
        ),
      });
      if (membership && (await inChallengeAudience(challenge.id, membership, userId))) canView = true;
    }
    if (!canView) {
      res.status(403).json({ error: "You don't have access to this challenge" }); return;
    }

    const progress = await computeProgress(challenge, participantIds);
    const leaderboard = await attachUserDisplay(progress.leaderboard, userId);

    let orgName: string | null = null;
    let challengeLeaderboardEnabled = true;
    if (challenge.orgId) {
      const org = await db.query.organisationsTable.findFirst({
        where: eq(organisationsTable.id, challenge.orgId),
      });
      orgName = org?.name ?? null;
      challengeLeaderboardEnabled = org?.challengeLeaderboardEnabled ?? true;
    }

    const me = leaderboard.find((l) => l.isMe) ?? null;

    res.json({
      challenge: {
        ...serializeChallenge(challenge),
        groups: (await challengeGroups([challenge.id])).get(challenge.id) ?? [],
        orgName,
        challengeLeaderboardEnabled,
        participantCount: participantIds.length,
        isOwner: challenge.ownerId === userId,
        isParticipant,
      },
      progress: {
        total: progress.total,
        target: progress.target,
        percent: progress.percent,
        contributingRecordIds: progress.contributingRecordIds,
      },
      leaderboard,
      myContribution: me,
    });
  } catch (err) {
    console.error("Get challenge error:", err);
    res.status(500).json({ error: "Failed to load challenge" });
  }
});

router.post("/join", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const body = req.body as Record<string, unknown>;
    const code = typeof body.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";
    if (!code) { res.status(400).json({ error: "Invite code required" }); return; }

    const challenge = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.inviteCode, code),
    });
    if (!challenge) { res.status(404).json({ error: "Invalid invite code" }); return; }

    if (challenge.endDate.getTime() < Date.now()) {
      res.status(400).json({ error: "This challenge has already ended" }); return;
    }

    if (challenge.scope === "org" && challenge.orgId) {
      const membership = await db.query.orgMembersTable.findFirst({
        where: and(
          eq(orgMembersTable.userId, userId),
          eq(orgMembersTable.orgId, challenge.orgId),
          eq(orgMembersTable.status, "active")
        ),
      });
      if (!membership) {
        res.status(403).json({ error: "You must be an active member of the organisation to join this challenge" }); return;
      }
      if (!(await inChallengeAudience(challenge.id, membership, userId))) {
        res.status(403).json({ error: "This challenge is for other groups in your organisation." }); return;
      }
    }

    await ensureParticipant(challenge.id, userId);

    res.json({ ok: true, challenge: serializeChallenge(challenge) });
  } catch (err) {
    console.error("Join challenge error:", err);
    res.status(500).json({ error: "Failed to join challenge" });
  }
});

router.post("/:id/leave", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = String(req.params.id);

    const challenge = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, id),
    });
    if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

    if (challenge.ownerId === userId) {
      res.status(400).json({ error: "Owners cannot leave their own challenge. Delete it instead." }); return;
    }

    await db
      .delete(challengeParticipantsTable)
      .where(
        and(
          eq(challengeParticipantsTable.challengeId, id),
          eq(challengeParticipantsTable.userId, userId)
        )
      );

    res.json({ ok: true });
  } catch (err) {
    console.error("Leave challenge error:", err);
    res.status(500).json({ error: "Failed to leave challenge" });
  }
});

router.post("/:id/end", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = String(req.params.id);

    const challenge = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, id),
    });
    if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

    let canEnd = challenge.ownerId === userId && !(await deactivatedFromChallengeOrg(challenge, userId));
    if (!canEnd && challenge.scope === "org" && challenge.orgId) {
      const membership = await getOrgManagerMembership(userId);
      if (membership && membership.orgId === challenge.orgId) canEnd = true;
    }
    if (!canEnd) {
      res.status(403).json({ error: "Only the challenge owner or org manager can end this challenge" }); return;
    }

    if (challenge.endDate.getTime() < Date.now()) {
      res.status(400).json({ error: "Challenge has already ended" }); return;
    }

    const now = new Date();
    const [updated] = await db
      .update(challengesTable)
      .set({ endDate: now })
      .where(eq(challengesTable.id, id))
      .returning();

    res.json({ ok: true, challenge: serializeChallenge(updated) });
  } catch (err) {
    console.error("End challenge error:", err);
    res.status(500).json({ error: "Failed to end challenge" });
  }
});

router.delete("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = String(req.params.id);

    const challenge = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, id),
    });
    if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

    let canDelete = challenge.ownerId === userId;
    if (!canDelete && challenge.scope === "org" && challenge.orgId) {
      const membership = await getOrgManagerMembership(userId);
      if (membership && membership.orgId === challenge.orgId) canDelete = true;
    }
    if (!canDelete) {
      res.status(403).json({ error: "Only the challenge owner can delete this challenge" }); return;
    }

    await db.delete(challengesTable).where(eq(challengesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete challenge error:", err);
    res.status(500).json({ error: "Failed to delete challenge" });
  }
});

router.post("/:id/send-summary", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = String(req.params.id);

    const challenge = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, id),
    });
    if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

    let canSend = challenge.ownerId === userId && !(await deactivatedFromChallengeOrg(challenge, userId));
    if (!canSend && challenge.scope === "org" && challenge.orgId) {
      const membership = await getOrgManagerMembership(userId);
      if (membership && membership.orgId === challenge.orgId) canSend = true;
    }
    if (!canSend) {
      res.status(403).json({ error: "Only the challenge owner can send the end summary" }); return;
    }

    if (challenge.endDate.getTime() > Date.now()) {
      res.status(400).json({ error: "Challenge has not ended yet" }); return;
    }

    if (challenge.endSummarySentAt) {
      res.status(409).json({ error: "Summary already sent", sentAt: challenge.endSummarySentAt.toISOString() }); return;
    }

    const participantRows = await db
      .select({ userId: challengeParticipantsTable.userId })
      .from(challengeParticipantsTable)
      .where(eq(challengeParticipantsTable.challengeId, id));
    const participantIds = participantRows.map((r) => r.userId);

    const progress = await computeProgress(challenge, participantIds);
    const leaderboard = await attachUserDisplay(progress.leaderboard, "");

    const users = participantIds.length
      ? await db
          .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
          .from(usersTable)
          .where(inArray(usersTable.id, participantIds))
      : [];

    const goalUnit = challenge.goalType === "hours" ? "hours" : "£";
    const formatVal = (n: number) =>
      challenge.goalType === "hours"
        ? `${Math.round(n).toLocaleString()} hours`
        : `£${Math.round(n).toLocaleString()}`;

    const topThree = leaderboard.slice(0, 3);

    let sentCount = 0;
    let errorCount = 0;
    try {
      const { client, fromEmail } = await getUncachableResendClient("challenge");
      for (const user of users) {
        try {
          const me = leaderboard.find((l) => l.userId === user.id);
          const greeting = user.displayName?.trim() || "there";
          const goalLine = `Together you reached ${formatVal(progress.total)} of a ${formatVal(progress.target)} target (${progress.percent}%).`;
          const myLine = me
            ? `<p style="margin:8px 0 16px;color:#374151;font-size:14px;">Your contribution: <strong>${formatVal(me.contribution)}</strong> — ranked #${me.rank} of ${leaderboard.length}.</p>`
            : "";
          const podium = topThree
            .map((p, idx) => {
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
              return `<li style="padding:6px 0;color:#213547;font-size:14px;">${medal} <strong>${escHtml(p.displayName.replace(/ \(you\)$/, ""))}</strong> — ${formatVal(p.contribution)}</li>`;
            })
            .join("");
          const html = `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
              <h2 style="color:#213547;margin-top:0;">"${escHtml(challenge.name)}" has wrapped up</h2>
              <p style="color:#374151;font-size:14px;">Hi ${escHtml(greeting)},</p>
              <p style="color:#374151;font-size:14px;line-height:1.5;">${escHtml(goalLine)}</p>
              ${myLine}
              <div style="background:white;border-radius:8px;padding:16px 20px;margin:16px 0;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Top contributors</p>
                <ul style="list-style:none;padding:0;margin:0;">${podium || '<li style="color:#9ca3af;font-size:13px;">No contributions recorded.</li>'}</ul>
              </div>
              <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Thanks for taking part. — My Impact</p>
            </div>
          `;
          const { error } = await client.emails.send({
            from: fromEmail,
            to: user.email,
            subject: `"${challenge.name}" wrapped — ${progress.percent}% of target`,
            html,
          });
          if (error) {
            errorCount++;
            console.error("Challenge summary email error:", error);
          } else {
            sentCount++;
          }
        } catch (err) {
          errorCount++;
          console.error("Challenge summary email error (per user):", err);
        }
      }
    } catch (err) {
      console.error("Resend client error:", err);
      res.status(500).json({ error: "Email service unavailable" }); return;
    }

    await db
      .update(challengesTable)
      .set({ endSummarySentAt: new Date() })
      .where(eq(challengesTable.id, id));

    res.json({ ok: true, sent: sentCount, failed: errorCount, goalUnit });
  } catch (err) {
    console.error("Send summary error:", err);
    res.status(500).json({ error: "Failed to send summary" });
  }
});

export default router;
