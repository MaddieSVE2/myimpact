import { Router, type IRouter } from "express";
import {
  db,
  orgMembersTable,
  orgSurveysTable,
  orgSurveyResponsesTable,
  orgSurveyOptOutsTable,
  challengesTable,
  challengeParticipantsTable,
  impactRecordsTable,
} from "@workspace/db";
import { and, eq, isNull, desc, inArray, gte, lte } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";

const router: IRouter = Router();

type Schedule = "one_off" | "monthly" | "quarterly";

function currentWindowKey(schedule: Schedule, now: Date = new Date()): string {
  if (schedule === "one_off") return "once";
  if (schedule === "monthly") {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${quarter}`;
}

interface ParsedResult { totalValue: number; totalHours: number; }
function parseResult(raw: unknown): ParsedResult {
  if (raw === null || typeof raw !== "object") return { totalValue: 0, totalHours: 0 };
  const r = raw as Record<string, unknown>;
  return {
    totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
  };
}

// Returns surveys + active org-wide challenges this member is part of, with
// per-member contribution and group progress. The client filters out items
// it has dismissed or snoozed locally.
router.get("/prompts", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (!membership) {
    res.json({ surveys: [], challenges: [], inOrg: false });
    return;
  }
  const { orgId } = membership;

  // ── Surveys ────────────────────────────────────────────────────────────
  const optOut = await db.query.orgSurveyOptOutsTable.findFirst({
    where: and(
      eq(orgSurveyOptOutsTable.orgId, orgId),
      eq(orgSurveyOptOutsTable.userId, userId),
    ),
  });

  let surveysOut: Array<{
    id: string;
    question: string;
    template: string;
    schedule: Schedule;
    anonymous: boolean;
    windowKey: string;
  }> = [];

  if (!optOut) {
    const surveys = await db.query.orgSurveysTable.findMany({
      where: and(
        eq(orgSurveysTable.orgId, orgId),
        isNull(orgSurveysTable.archivedAt),
      ),
      orderBy: (t) => [desc(t.createdAt)],
    });
    if (surveys.length > 0) {
      const responses = await db.query.orgSurveyResponsesTable.findMany({
        where: eq(orgSurveyResponsesTable.userId, userId),
      });
      const responded = new Set(responses.map(r => `${r.surveyId}::${r.windowKey}`));
      surveysOut = surveys
        .map(s => ({ s, windowKey: currentWindowKey(s.schedule as Schedule) }))
        .filter(({ s, windowKey }) => !responded.has(`${s.id}::${windowKey}`))
        .map(({ s, windowKey }) => ({
          id: s.id,
          question: s.question,
          template: s.template,
          schedule: s.schedule as Schedule,
          anonymous: s.anonymous,
          windowKey,
        }));
    }
  }

  // ── Active org challenges this member participates in ─────────────────
  const now = new Date();
  const partRows = await db
    .select({ challengeId: challengeParticipantsTable.challengeId })
    .from(challengeParticipantsTable)
    .where(eq(challengeParticipantsTable.userId, userId));
  const myChallengeIds = partRows.map(r => r.challengeId);

  let challengesOut: Array<{
    id: string;
    name: string;
    goalType: "social_value" | "hours";
    target: number;
    endDate: string;
    daysRemaining: number;
    participantCount: number;
    progressTotal: number;
    progressPercent: number;
    myContribution: number;
  }> = [];

  if (myChallengeIds.length > 0) {
    const orgActive = await db
      .select()
      .from(challengesTable)
      .where(
        and(
          inArray(challengesTable.id, myChallengeIds),
          eq(challengesTable.scope, "org"),
          eq(challengesTable.orgId, orgId),
          lte(challengesTable.startDate, now),
          gte(challengesTable.endDate, now),
        ),
      );

    if (orgActive.length > 0) {
      const ids = orgActive.map(c => c.id);
      const allParts = await db
        .select({
          challengeId: challengeParticipantsTable.challengeId,
          userId: challengeParticipantsTable.userId,
        })
        .from(challengeParticipantsTable)
        .where(inArray(challengeParticipantsTable.challengeId, ids));

      const partsByCh: Record<string, string[]> = {};
      for (const p of allParts) {
        (partsByCh[p.challengeId] ??= []).push(p.userId);
      }

      const summaries = await Promise.all(
        orgActive.map(async (c) => {
          const participantIds = partsByCh[c.id] ?? [];
          const records = participantIds.length === 0
            ? []
            : await db
                .select()
                .from(impactRecordsTable)
                .where(
                  and(
                    inArray(impactRecordsTable.userId, participantIds),
                    gte(impactRecordsTable.entryDate, c.startDate),
                    lte(impactRecordsTable.entryDate, c.endDate),
                    lte(impactRecordsTable.createdAt, c.endDate),
                    eq(impactRecordsTable.submittedToOrgId, orgId),
                  ),
                );

          let total = 0;
          let mine = 0;
          for (const r of records) {
            const p = parseResult(r.resultJson);
            const contribution = c.goalType === "hours" ? p.totalHours : p.totalValue;
            total += contribution;
            if (r.userId === userId) mine += contribution;
          }

          const target = Number(c.target);
          const percent = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
          const daysRemaining = Math.max(
            0,
            Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
          );

          return {
            id: c.id,
            name: c.name,
            goalType: c.goalType as "social_value" | "hours",
            target,
            endDate: c.endDate.toISOString(),
            daysRemaining,
            participantCount: participantIds.length,
            progressTotal: Math.round(total * 100) / 100,
            progressPercent: percent,
            myContribution: Math.round(mine * 100) / 100,
          };
        }),
      );

      // Soonest end date first
      summaries.sort((a, b) => a.daysRemaining - b.daysRemaining);
      challengesOut = summaries;
    }
  }

  res.json({
    inOrg: true,
    surveys: surveysOut,
    challenges: challengesOut,
  });
});

export default router;
