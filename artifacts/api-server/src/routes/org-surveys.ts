import { Router, type IRouter, type Response } from "express";
import {
  db,
  orgMembersTable,
  orgSurveysTable,
  orgSurveyResponsesTable,
  orgSurveyOptOutsTable,
  organisationsTable,
} from "@workspace/db";
import { and, eq, isNull, desc, asc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getOrgSharingContext, REVOKED_ORG_MESSAGE } from "../lib/orgSharing.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Templates the manager can pick from
// ---------------------------------------------------------------------------

const TEMPLATES = {
  meaningfulness: {
    label: "Meaningfulness",
    question: "How meaningful was your last activity?",
  },
  wellbeing: {
    label: "Wellbeing check-in",
    question: "How are you feeling about your volunteering this week?",
  },
  custom: {
    label: "Custom question",
    question: "",
  },
} as const;
type TemplateKey = keyof typeof TEMPLATES;

const SCHEDULES = ["one_off", "monthly", "quarterly"] as const;
type Schedule = (typeof SCHEDULES)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentWindowKey(schedule: Schedule, now: Date = new Date()): string {
  if (schedule === "one_off") return "once";
  if (schedule === "monthly") {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  // quarterly
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${quarter}`;
}

function describeWindow(schedule: Schedule, key: string): string {
  if (schedule === "one_off") return "All time";
  if (schedule === "monthly") {
    const [y, m] = key.split("-");
    if (!y || !m) return key;
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }
  return key.replace("-", " ");
}

async function requireMembership(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")),
  });
  if (!membership) {
    res.status(404).json({ error: "You are not a member of any organisation." });
    return null;
  }
  return membership;
}

async function requireManager(req: AuthenticatedRequest, res: Response) {
  const m = await requireMembership(req, res);
  if (!m) return null;
  if (m.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can manage surveys." });
    return null;
  }
  const sharingCtx = await getOrgSharingContext(m.orgId);
  if (sharingCtx.revoked) {
    res.status(403).json({ error: REVOKED_ORG_MESSAGE });
    return null;
  }
  return m;
}

// ---------------------------------------------------------------------------
// Manager: list templates
// ---------------------------------------------------------------------------

router.get("/surveys/templates", authenticate, async (_req: AuthenticatedRequest, res) => {
  res.json({
    templates: Object.entries(TEMPLATES).map(([key, t]) => ({
      key,
      label: t.label,
      question: t.question,
    })),
    schedules: SCHEDULES,
  });
});

// ---------------------------------------------------------------------------
// Manager: list surveys for org
// ---------------------------------------------------------------------------

router.get("/surveys", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireManager(req, res);
  if (!m) return;

  const surveys = await db.query.orgSurveysTable.findMany({
    where: eq(orgSurveysTable.orgId, m.orgId),
    orderBy: (t) => [desc(t.createdAt)],
  });

  // Compute latest-window average for each survey in a single query
  let latestAverageMap: Record<string, number | null> = {};
  if (surveys.length > 0) {
    const surveyIds = surveys.map(s => s.id);
    const allResponses = await db.query.orgSurveyResponsesTable.findMany({
      where: inArray(orgSurveyResponsesTable.surveyId, surveyIds),
    });
    // Group by surveyId → windowKey → ratings
    const grouped: Record<string, Record<string, number[]>> = {};
    for (const r of allResponses) {
      if (!grouped[r.surveyId]) grouped[r.surveyId] = {};
      if (!grouped[r.surveyId][r.windowKey]) grouped[r.surveyId][r.windowKey] = [];
      grouped[r.surveyId][r.windowKey].push(r.rating);
    }
    for (const s of surveys) {
      const windows = grouped[s.id];
      if (!windows || Object.keys(windows).length === 0) {
        latestAverageMap[s.id] = null;
        continue;
      }
      const latestKey = Object.keys(windows).sort().at(-1)!;
      const ratings = windows[latestKey];
      latestAverageMap[s.id] = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100;
    }
  }

  res.json({
    surveys: surveys.map(s => ({
      id: s.id,
      template: s.template,
      question: s.question,
      schedule: s.schedule,
      anonymous: s.anonymous,
      createdAt: s.createdAt.toISOString(),
      archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
      latestAverage: latestAverageMap[s.id] ?? null,
    })),
  });
});

// ---------------------------------------------------------------------------
// Manager: create survey
// ---------------------------------------------------------------------------

router.post("/surveys", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireManager(req, res);
  if (!m) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const templateRaw = typeof body.template === "string" ? body.template : "";
  if (!(templateRaw in TEMPLATES)) {
    res.status(400).json({ error: `template must be one of: ${Object.keys(TEMPLATES).join(", ")}.` });
    return;
  }
  const template = templateRaw as TemplateKey;

  let question = TEMPLATES[template].question;
  if (template === "custom") {
    if (typeof body.question !== "string" || !body.question.trim()) {
      res.status(400).json({ error: "Custom surveys require a question." });
      return;
    }
    question = body.question.trim().slice(0, 200);
  } else if (typeof body.question === "string" && body.question.trim()) {
    question = body.question.trim().slice(0, 200);
  }

  const scheduleRaw = typeof body.schedule === "string" ? body.schedule : "";
  if (!SCHEDULES.includes(scheduleRaw as Schedule)) {
    res.status(400).json({ error: `schedule must be one of: ${SCHEDULES.join(", ")}.` });
    return;
  }
  const schedule = scheduleRaw as Schedule;

  const anonymous = body.anonymous === false ? false : true;

  const id = randomUUID();
  await db.insert(orgSurveysTable).values({
    id,
    orgId: m.orgId,
    template,
    question,
    schedule,
    anonymous,
    createdBy: req.user!.id,
  });

  res.status(201).json({
    id,
    template,
    question,
    schedule,
    anonymous,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  });
});

// ---------------------------------------------------------------------------
// Manager: archive (soft-delete) a survey
// ---------------------------------------------------------------------------

router.post("/surveys/:id/archive", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireManager(req, res);
  if (!m) return;
  const id = req.params.id as string;

  const existing = await db.query.orgSurveysTable.findFirst({
    where: and(eq(orgSurveysTable.id, id), eq(orgSurveysTable.orgId, m.orgId)),
  });
  if (!existing) {
    res.status(404).json({ error: "Survey not found." });
    return;
  }
  if (existing.archivedAt) {
    res.json({ ok: true, alreadyArchived: true });
    return;
  }
  await db.update(orgSurveysTable)
    .set({ archivedAt: new Date() })
    .where(eq(orgSurveysTable.id, id));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Manager: aggregated results for a survey
// ---------------------------------------------------------------------------

router.get("/surveys/:id/results", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireManager(req, res);
  if (!m) return;

  // Server-side dashboard-section gating: pulse results are hidden when the
  // super-admin has disabled the pulse summary section for this org.
  const sharingCtx = await getOrgSharingContext(m.orgId);
  if (sharingCtx.revoked) {
    res.status(403).json({ error: REVOKED_ORG_MESSAGE });
    return;
  }
  if (!sharingCtx.sections.pulseSummary) {
    res.status(403).json({ error: "Pulse survey results are disabled for this organisation." });
    return;
  }
  const id = req.params.id as string;

  const survey = await db.query.orgSurveysTable.findFirst({
    where: and(eq(orgSurveysTable.id, id), eq(orgSurveysTable.orgId, m.orgId)),
  });
  if (!survey) {
    res.status(404).json({ error: "Survey not found." });
    return;
  }

  const responses = await db.query.orgSurveyResponsesTable.findMany({
    where: eq(orgSurveyResponsesTable.surveyId, id),
    orderBy: (t) => [asc(t.createdAt)],
  });

  // Anonymity guard: never disclose responder identities, even if anonymous=false.
  // (We could expose userId behind a separate non-anonymous endpoint later.)

  // Distribution 1..5
  const distribution = [1, 2, 3, 4, 5].map(rating => ({
    rating,
    count: responses.filter(r => r.rating === rating).length,
  }));

  // Average overall
  const total = responses.length;
  const sum = responses.reduce((s, r) => s + r.rating, 0);
  const average = total > 0 ? sum / total : 0;

  // Trend by window: average per windowKey, sorted
  const trendMap: Record<string, { sum: number; count: number; ratings: number[] }> = {};
  for (const r of responses) {
    if (!trendMap[r.windowKey]) trendMap[r.windowKey] = { sum: 0, count: 0, ratings: [] };
    trendMap[r.windowKey].sum += r.rating;
    trendMap[r.windowKey].count += 1;
    trendMap[r.windowKey].ratings.push(r.rating);
  }
  const trend = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      windowKey: key,
      label: describeWindow(survey.schedule as Schedule, key),
      average: Math.round((v.sum / v.count) * 100) / 100,
      count: v.count,
      distribution: [1, 2, 3, 4, 5].map(rating => ({
        rating,
        count: v.ratings.filter(r => r === rating).length,
      })),
    }));

  // Comments. If anonymous, suppress completely beyond the comment text and date.
  // Minimum 5 responses in a given window before showing any comments from it,
  // to make re-identification harder for small groups.
  const COMMENT_PRIVACY_THRESHOLD = 5;
  const eligibleWindows = new Set(
    Object.entries(trendMap).filter(([, v]) => v.count >= COMMENT_PRIVACY_THRESHOLD).map(([k]) => k),
  );
  const comments = responses
    .filter(r => r.comment && r.comment.trim().length > 0)
    .filter(r => survey.anonymous ? eligibleWindows.has(r.windowKey) : true)
    .map(r => ({
      id: r.id,
      comment: r.comment!.slice(0, 500),
      windowKey: r.windowKey,
      windowLabel: describeWindow(survey.schedule as Schedule, r.windowKey),
      createdAt: r.createdAt.toISOString(),
    }))
    .reverse(); // newest first

  res.json({
    survey: {
      id: survey.id,
      template: survey.template,
      question: survey.question,
      schedule: survey.schedule,
      anonymous: survey.anonymous,
      createdAt: survey.createdAt.toISOString(),
      archivedAt: survey.archivedAt ? survey.archivedAt.toISOString() : null,
    },
    totals: {
      responses: total,
      average: Math.round(average * 100) / 100,
    },
    distribution,
    trend,
    comments,
    commentPrivacyThreshold: COMMENT_PRIVACY_THRESHOLD,
  });
});

// ---------------------------------------------------------------------------
// Member: list surveys currently active for me
// ---------------------------------------------------------------------------

router.get("/surveys/active", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireMembership(req, res);
  if (!m) return;

  // Opt-out short-circuit
  const optOut = await db.query.orgSurveyOptOutsTable.findFirst({
    where: and(
      eq(orgSurveyOptOutsTable.orgId, m.orgId),
      eq(orgSurveyOptOutsTable.userId, req.user!.id),
    ),
  });
  if (optOut) {
    res.json({ surveys: [], optedOut: true });
    return;
  }

  const surveys = await db.query.orgSurveysTable.findMany({
    where: and(
      eq(orgSurveysTable.orgId, m.orgId),
      isNull(orgSurveysTable.archivedAt),
    ),
    orderBy: (t) => [desc(t.createdAt)],
  });

  if (surveys.length === 0) {
    res.json({ surveys: [], optedOut: false });
    return;
  }

  // Find responses by this user for the current windows
  const surveyWithWindow = surveys.map(s => ({
    survey: s,
    windowKey: currentWindowKey(s.schedule as Schedule),
  }));

  const responses = await db.query.orgSurveyResponsesTable.findMany({
    where: eq(orgSurveyResponsesTable.userId, req.user!.id),
  });
  const respondedSet = new Set(
    responses.map(r => `${r.surveyId}::${r.windowKey}`),
  );

  const active = surveyWithWindow
    .filter(({ survey, windowKey }) => !respondedSet.has(`${survey.id}::${windowKey}`))
    .map(({ survey, windowKey }) => ({
      id: survey.id,
      question: survey.question,
      template: survey.template,
      schedule: survey.schedule,
      anonymous: survey.anonymous,
      windowKey,
    }));

  res.json({ surveys: active, optedOut: false });
});

// ---------------------------------------------------------------------------
// Member: respond to a survey
// ---------------------------------------------------------------------------

router.post("/surveys/:id/respond", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireMembership(req, res);
  if (!m) return;
  const id = req.params.id as string;

  // Block if opted out
  const optOut = await db.query.orgSurveyOptOutsTable.findFirst({
    where: and(
      eq(orgSurveyOptOutsTable.orgId, m.orgId),
      eq(orgSurveyOptOutsTable.userId, req.user!.id),
    ),
  });
  if (optOut) {
    res.status(403).json({ error: "You have opted out of surveys for this organisation." });
    return;
  }

  const survey = await db.query.orgSurveysTable.findFirst({
    where: and(
      eq(orgSurveysTable.id, id),
      eq(orgSurveysTable.orgId, m.orgId),
      isNull(orgSurveysTable.archivedAt),
    ),
  });
  if (!survey) {
    res.status(404).json({ error: "Survey not found or no longer active." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const ratingRaw = typeof body.rating === "number" ? body.rating : Number(body.rating);
  if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
    res.status(400).json({ error: "rating must be an integer between 1 and 5." });
    return;
  }

  let comment: string | null = null;
  if (typeof body.comment === "string" && body.comment.trim()) {
    comment = body.comment.trim().slice(0, 500);
  }

  const windowKey = currentWindowKey(survey.schedule as Schedule);

  // Try insert; if user already responded for this window, return 409.
  try {
    await db.insert(orgSurveyResponsesTable).values({
      id: randomUUID(),
      surveyId: survey.id,
      userId: req.user!.id,
      windowKey,
      rating: ratingRaw,
      comment,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      res.status(409).json({ error: "You've already responded to this survey for the current period." });
      return;
    }
    throw err;
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Member: opt-out preference
// ---------------------------------------------------------------------------

router.get("/surveys/opt-out", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireMembership(req, res);
  if (!m) return;

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, m.orgId),
  });

  const optOut = await db.query.orgSurveyOptOutsTable.findFirst({
    where: and(
      eq(orgSurveyOptOutsTable.orgId, m.orgId),
      eq(orgSurveyOptOutsTable.userId, req.user!.id),
    ),
  });

  res.json({
    orgId: m.orgId,
    orgName: org?.name ?? null,
    optedOut: !!optOut,
  });
});

router.post("/surveys/opt-out", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireMembership(req, res);
  if (!m) return;

  const optedOut = req.body?.optedOut === true;

  if (optedOut) {
    // Insert if not already present
    const existing = await db.query.orgSurveyOptOutsTable.findFirst({
      where: and(
        eq(orgSurveyOptOutsTable.orgId, m.orgId),
        eq(orgSurveyOptOutsTable.userId, req.user!.id),
      ),
    });
    if (!existing) {
      await db.insert(orgSurveyOptOutsTable).values({
        orgId: m.orgId,
        userId: req.user!.id,
      });
    }
  } else {
    await db.delete(orgSurveyOptOutsTable).where(
      and(
        eq(orgSurveyOptOutsTable.orgId, m.orgId),
        eq(orgSurveyOptOutsTable.userId, req.user!.id),
      ),
    );
  }

  res.json({ optedOut });
});

export default router;
