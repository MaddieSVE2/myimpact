import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted mock state shared across vi.mock factories and tests ─────────────
const state = vi.hoisted(() => ({
  authUser: null as { id: string; email: string } | null,
  membership: null as { orgId: string; userId: string; role: string } | null,
  optOut: null as { orgId: string; userId: string } | null,
  surveys: [] as Array<{
    id: string;
    orgId: string;
    question: string;
    template: string;
    schedule: "one_off" | "monthly" | "quarterly";
    anonymous: boolean;
    archivedAt: Date | null;
    createdAt: Date;
  }>,
  surveyResponses: [] as Array<{ surveyId: string; userId: string; windowKey: string }>,
  selectQueue: [] as unknown[][],
}));

vi.mock("@workspace/db", () => {
  const tableTag = (name: string) => ({ __tableName: name });

  function builderFor(rows: () => unknown[]) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.from = chain;
    b.where = chain;
    b.orderBy = chain;
    b.limit = chain;
    b.groupBy = chain;
    b.then = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows()).then(resolve, reject);
    b.catch = (reject: (e: unknown) => unknown) => Promise.resolve(rows()).catch(reject);
    b.finally = (cb: () => void) => Promise.resolve(rows()).finally(cb);
    return b;
  }

  const db = {
    query: {
      orgMembersTable: {
        findFirst: vi.fn(async () => state.membership),
      },
      orgSurveyOptOutsTable: {
        findFirst: vi.fn(async () => state.optOut),
      },
      orgSurveysTable: {
        findMany: vi.fn(async () => state.surveys),
      },
      orgSurveyResponsesTable: {
        findMany: vi.fn(async () => state.surveyResponses),
      },
    },
    select: (_cols?: unknown) =>
      builderFor(() => state.selectQueue.shift() ?? []),
  };

  return {
    db,
    orgMembersTable: tableTag("org_members"),
    orgSurveysTable: tableTag("org_surveys"),
    orgSurveyResponsesTable: tableTag("org_survey_responses"),
    orgSurveyOptOutsTable: tableTag("org_survey_opt_outs"),
    challengesTable: tableTag("challenges"),
    challengeParticipantsTable: tableTag("challenge_participants"),
    impactRecordsTable: tableTag("impact_records"),
  };
});

vi.mock("../src/middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!state.authUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    (req as express.Request & { user?: { id: string; email: string } }).user = state.authUser;
    next();
  },
}));

const { default: orgPromptsRouter } = await import("../src/routes/org-prompts.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/org", orgPromptsRouter);
  return app;
}

function currentMonthlyKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

beforeEach(() => {
  state.authUser = null;
  state.membership = null;
  state.optOut = null;
  state.surveys = [];
  state.surveyResponses = [];
  state.selectQueue.length = 0;
});

describe("GET /api/org/prompts", () => {
  it("returns inOrg:false with empty arrays for non-members", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = null;

    const app = makeApp();
    const res = await request(app).get("/api/org/prompts");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inOrg: false, surveys: [], challenges: [] });
  });

  it("returns an active survey with the correct windowKey for a member", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.surveys = [
      {
        id: "survey-1",
        orgId: "org-1",
        question: "How are you feeling about volunteering this month?",
        template: "wellbeing",
        schedule: "monthly",
        anonymous: false,
        archivedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    // No participation in challenges → first select() returns [].
    state.selectQueue.push([]);

    const app = makeApp();
    const res = await request(app).get("/api/org/prompts");

    expect(res.status).toBe(200);
    expect(res.body.inOrg).toBe(true);
    expect(res.body.challenges).toEqual([]);
    expect(res.body.surveys).toHaveLength(1);
    expect(res.body.surveys[0]).toMatchObject({
      id: "survey-1",
      question: "How are you feeling about volunteering this month?",
      template: "wellbeing",
      schedule: "monthly",
      anonymous: false,
      windowKey: currentMonthlyKey(),
    });
  });

  it("filters out a survey the member has already responded to for the current window", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.surveys = [
      {
        id: "survey-1",
        orgId: "org-1",
        question: "Q?",
        template: "wellbeing",
        schedule: "monthly",
        anonymous: false,
        archivedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    state.surveyResponses = [
      { surveyId: "survey-1", userId: "user-1", windowKey: currentMonthlyKey() },
    ];
    state.selectQueue.push([]); // no challenge participation

    const app = makeApp();
    const res = await request(app).get("/api/org/prompts");

    expect(res.status).toBe(200);
    expect(res.body.surveys).toEqual([]);
  });

  it("returns no surveys when the member has opted out", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.optOut = { orgId: "org-1", userId: "user-1" };
    // Surveys exist in the org, but should never be queried/returned.
    state.surveys = [
      {
        id: "survey-1",
        orgId: "org-1",
        question: "Q?",
        template: "wellbeing",
        schedule: "monthly",
        anonymous: false,
        archivedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    state.selectQueue.push([]); // no challenge participation

    const app = makeApp();
    const res = await request(app).get("/api/org/prompts");

    expect(res.status).toBe(200);
    expect(res.body.inOrg).toBe(true);
    expect(res.body.surveys).toEqual([]);
  });

  it("returns active org challenges the member participates in, with progress and myContribution", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };

    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 1) participation rows for me
    state.selectQueue.push([{ challengeId: "ch-1" }]);
    // 2) orgActive challenges
    state.selectQueue.push([
      {
        id: "ch-1",
        orgId: "org-1",
        scope: "org",
        name: "Spring tree planting",
        goalType: "hours",
        target: "100",
        startDate,
        endDate,
      },
    ]);
    // 3) all participants for those challenges
    state.selectQueue.push([
      { challengeId: "ch-1", userId: "user-1" },
      { challengeId: "ch-1", userId: "user-2" },
    ]);
    // 4) impact records for the participants in window
    state.selectQueue.push([
      { userId: "user-1", resultJson: { totalHours: 10, totalValue: 0 }, createdAt: new Date() },
      { userId: "user-2", resultJson: { totalHours: 15, totalValue: 0 }, createdAt: new Date() },
    ]);

    const app = makeApp();
    const res = await request(app).get("/api/org/prompts");

    expect(res.status).toBe(200);
    expect(res.body.inOrg).toBe(true);
    expect(res.body.challenges).toHaveLength(1);
    const ch = res.body.challenges[0];
    expect(ch.id).toBe("ch-1");
    expect(ch.name).toBe("Spring tree planting");
    expect(ch.goalType).toBe("hours");
    expect(ch.target).toBe(100);
    expect(ch.participantCount).toBe(2);
    expect(ch.progressTotal).toBe(25);
    expect(ch.progressPercent).toBe(25);
    expect(ch.myContribution).toBe(10);
    expect(typeof ch.endDate).toBe("string");
    expect(ch.daysRemaining).toBeGreaterThanOrEqual(6);
    expect(ch.daysRemaining).toBeLessThanOrEqual(8);
  });

  it("does not return a challenge the member is not a participant of", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    // No participation rows → never queries challengesTable.
    state.selectQueue.push([]);

    const app = makeApp();
    const res = await request(app).get("/api/org/prompts");

    expect(res.status).toBe(200);
    expect(res.body.inOrg).toBe(true);
    expect(res.body.challenges).toEqual([]);
  });
});
