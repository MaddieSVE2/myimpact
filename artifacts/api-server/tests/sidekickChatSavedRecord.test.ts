import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// The chat route itself: what is actually sent to the AI model for a
// signed-in person, an anonymous visitor, and a manager speaking for their
// organisation. Everything around the route (sign-in, limits, the model) is
// replaced; the database readers are replaced so a test can prove whether
// the saved record was read.

type Sent = { role: string; content: string }[];

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  membership: null as { orgId: string; userId: string } | null,
  org: null as { aiSidekickEnabled: boolean; dataSharingMode: string } | null,
  sent: [] as { role: string; content: string }[][],
}));

const aggregation = vi.hoisted(() => ({
  aggregateLifetime: vi.fn(),
  aggregateYear: vi.fn(),
}));

vi.mock("../src/lib/recordAggregation.js", () => aggregation);

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@workspace/db", () => ({
  db: {
    query: {
      orgMembersTable: { findFirst: async () => state.membership },
      organisationsTable: { findFirst: async () => state.org },
      usersTable: { findFirst: async () => null },
    },
  },
  organisationsTable: {},
  orgMembersTable: {},
  usersTable: {},
  sidekickTemplateOverridesTable: {},
}));

vi.mock("../src/middleware/authenticate.js", () => ({
  attachUserIfPresent: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (state.user) (req as express.Request & { user?: unknown }).user = state.user;
    next();
  },
  authenticate: (_req: express.Request, res: express.Response) => {
    res.status(401).end();
  },
}));

vi.mock("../src/lib/aiUsage.js", () => {
  const pass = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
  return {
    aiPerIpLimiter: pass,
    aiPerUserLimiter: pass,
    sidekickQuotaGate: pass,
    applyInflightToQuota: (quota: unknown) => quota,
    getInflightCount: async () => 0,
    getRemainingQuota: async () => ({}),
    getUserKey: () => "test-key",
    incrementUsage: async () => undefined,
  };
});

vi.mock("../src/lib/voiceUsage.js", () => ({
  TRANSCRIBE_SECONDS_CAP: 600,
  TTS_CHARACTERS_CAP: 1000,
  VOICE_CAP_REACHED_MESSAGE: "",
  atomicReserveTranscribeSeconds: vi.fn(),
  atomicReserveTtsChars: vi.fn(),
  estimateTranscribeCostPence: vi.fn(),
  estimateTtsCostPence: vi.fn(),
  getUserVoiceUsage: vi.fn(),
  probeAudioDurationSeconds: vi.fn(),
  releaseTranscribeSeconds: vi.fn(),
}));

vi.mock("../src/lib/sidekickFailureAlert.js", () => ({ recordSidekickChatFailure: vi.fn() }));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  detectAudioVolume: vi.fn(),
  ensureCompatibleFormat: vi.fn(),
  speechToText: vi.fn(),
  textToSpeech: vi.fn(),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: async (params: { messages: { role: string; content: string }[] }) => {
          state.sent.push(params.messages);
          return {
            controller: new AbortController(),
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: "Here is what your record shows." } }] };
              yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } };
            },
          };
        },
      },
    },
  },
}));

const { default: sidekickRouter } = await import("../src/routes/sidekick.js");
const { buildSidekickContextMessage } = await import("../src/lib/sidekickContext.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/sidekick", sidekickRouter);
  return app;
}

const QUESTION = [{ role: "user", content: "Can you get it from my record?" }];

const LIFETIME = {
  records: [
    { entryDate: new Date(Date.UTC(2024, 2, 9)) },
    { entryDate: new Date(Date.UTC(2026, 9, 30)) },
  ],
  totalValue: 4210.46,
  totalHours: 312,
  activityMap: new Map([
    ["food_bank", { activityName: "Food bank volunteering", impactValue: 2400, hours: 120 }],
    ["mentoring", { activityName: "Youth mentoring", impactValue: 1500, hours: 80 }],
  ]),
};

/** Sends one chat message and returns what the route passed to the model. */
async function ask(context: unknown): Promise<{ sent: Sent; context: string[] }> {
  state.sent.length = 0;
  await request(makeApp()).post("/api/sidekick/chat").send({ messages: QUESTION, context }).expect(200);
  expect(state.sent).toHaveLength(1);
  const sent = state.sent[0]!;
  const system = sent.filter((m) => m.role === "system");
  // system[0] is the fixed instructions and system[1] the fixed tools line;
  // anything after is written for this request.
  return { sent, context: system.slice(2).map((m) => m.content) };
}

beforeEach(() => {
  state.user = null;
  state.membership = null;
  state.org = null;
  aggregation.aggregateLifetime.mockReset().mockResolvedValue(LIFETIME);
  aggregation.aggregateYear.mockReset().mockResolvedValue({ totalValue: 1850, totalHours: 140 });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("POST /api/sidekick/chat and the saved record", () => {
  it("gives the model a signed-in person's saved record, with no calculation open", async () => {
    state.user = { id: "user_1", email: "u1@example.com" };
    const { sent, context } = await ask(undefined);

    expect(aggregation.aggregateLifetime).toHaveBeenCalledWith("user_1");
    expect(aggregation.aggregateYear).toHaveBeenCalledWith("user_1", new Date().getUTCFullYear());
    expect(context).toHaveLength(1);
    expect(context[0]).toContain("SAVED RECORD:");
    expect(context[0]).toContain("All time: £4,210 total social value and 312 hours.");
    expect(context[0]).toContain("Food bank volunteering (120 hours); Youth mentoring (80 hours).");
    // The person's own message is passed on as it was.
    expect(sent[sent.length - 1]).toEqual(QUESTION[0]);
    // The fixed instructions explain the saved record and keep the application rules.
    expect(sent[0]!.content).toContain("THE PERSON'S SAVED RECORD:");
    expect(sent[0]!.content).toContain("APPLICATION-WRITING SAFETY:");
  });

  it("reads the record for the signed-in person only, whatever the browser claims", async () => {
    state.user = { id: "user_1", email: "u1@example.com" };
    const { context } = await ask({ totalValue: 999_999, activities: ["Made-up activity"], userId: "someone_else" });

    expect(aggregation.aggregateLifetime).toHaveBeenCalledTimes(1);
    expect(aggregation.aggregateLifetime).toHaveBeenCalledWith("user_1");
    expect(context[0]).toContain("All time: £4,210 total social value");
    // What the browser sent is labelled as the on-screen calculation, apart
    // from the saved totals.
    expect(context[0]).toContain("The result open on their screen right now comes to £999,999.");
  });

  it("reads nothing for an anonymous visitor, and sends what it sent before", async () => {
    const browserContext = { totalValue: 950, activities: ["Dog walking"], interests: ["caring"] };
    const { context } = await ask(browserContext);

    expect(aggregation.aggregateLifetime).not.toHaveBeenCalled();
    expect(aggregation.aggregateYear).not.toHaveBeenCalled();
    expect(context).toEqual([buildSidekickContextMessage(browserContext)]);
    expect(context[0]).not.toContain("SAVED RECORD:");

    // No context at all: nothing is added for this request.
    expect((await ask(undefined)).context).toEqual([]);
    expect(aggregation.aggregateLifetime).not.toHaveBeenCalled();
  });

  it("reads nothing about a manager's own record when they speak for their organisation", async () => {
    state.user = { id: "manager_1", email: "m@example.com" };
    state.membership = { orgId: "org_1", userId: "manager_1" };
    state.org = { aiSidekickEnabled: true, dataSharingMode: "explicit_submission" };
    const { sent, context } = await ask({
      interests: ["org_manager"],
      org: { name: "Riverside Food Bank", totalSocialValue: 12400, totalHours: 830, people: 42 },
    });

    expect(aggregation.aggregateLifetime).not.toHaveBeenCalled();
    expect(aggregation.aggregateYear).not.toHaveBeenCalled();
    expect(context).toHaveLength(1);
    expect(context[0]).toContain("organisation manager at Riverside Food Bank");
    expect(context[0]).toContain("£12,400 total social value");
    const everythingForThisRequest = sent.slice(2).map((m) => m.content).join("\n");
    expect(everythingForThisRequest).not.toContain("SAVED RECORD:");
    expect(everythingForThisRequest).not.toContain("£4,210");
    expect(everythingForThisRequest).not.toContain("Food bank volunteering");
  });

  it("still answers when the saved record cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "user_1", email: "u1@example.com" };
    aggregation.aggregateLifetime.mockRejectedValue(new Error("database is down"));
    const { context } = await ask({ interests: ["caring"] });

    expect(context[0]).toContain("could not be read for this message");
    expect(context[0]).toContain("Do not invent figures");
    quiet.mockRestore();
  });
});
