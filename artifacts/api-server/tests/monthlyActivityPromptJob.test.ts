/**
 * The monthly "anything to add?" job against a fake database and a fake
 * Resend: that it sends nothing until switched on, that a test goes only to
 * the listed accounts, and that nobody is emailed twice in a month.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  users: [] as Row[],
  suppressed: [] as string[],
  /** User ids another run has already claimed this month. */
  claimedElsewhere: [] as string[],
  /** Every update to users: who, and what was set. */
  updates: [] as { userId: unknown; values: Row }[],
  sends: [] as Row[],
  categories: [] as string[],
  failFor: [] as string[],
  userSelects: 0,
}));

/** The values bound into a drizzle condition, e.g. the id in eq(users.id, x). */
function paramsOf(sql: unknown): unknown[] {
  const chunks = (sql as { queryChunks?: unknown[] } | null)?.queryChunks ?? [];
  return chunks.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    if ((c as object).constructor?.name === "Param") return [(c as { value: unknown }).value];
    return paramsOf(c);
  });
}

vi.mock("@workspace/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workspace/db")>();
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === real.usersTable) {
            state.userSelects++;
            return state.users;
          }
          return state.suppressed.map((email) => ({ email }));
        },
      }),
    }),
    update: () => ({
      set: (values: Row) => ({
        where: (cond: unknown) => {
          const [userId] = paramsOf(cond);
          const run = () => {
            state.updates.push({ userId, values });
            return state.claimedElsewhere.includes(String(userId)) ? [] : [{ id: userId }];
          };
          return {
            returning: async () => run(),
            then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
          };
        },
      }),
    }),
  };
  return { ...real, db };
});

vi.mock("../src/lib/resend.js", () => ({
  getUncachableResendClient: async (category: string) => {
    state.categories.push(category);
    return {
      fromEmail: "My Impact <team@example.org>",
      client: {
        emails: {
          send: async (payload: Row) => {
            state.sends.push(payload);
            return state.failFor.includes(String(payload.to))
              ? { data: null, error: { name: "application_error", message: "Resend is down" } }
              : { data: { id: "re_1" }, error: null };
          },
        },
      },
    };
  },
}));

import { runMonthlyActivityPrompt } from "../src/jobs/monthlyActivityPrompt.js";

const user = (id: string, email: string, extra: Row = {}) => ({
  id,
  email,
  displayName: "Jo",
  optIn: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  lastSentAt: null,
  locale: "en",
  ...extra,
});

beforeEach(() => {
  state.users = [user("u1", "jo@example.org"), user("u2", "sam@example.org")];
  state.suppressed = [];
  state.claimedElsewhere = [];
  state.updates = [];
  state.sends = [];
  state.categories = [];
  state.failFor = [];
  state.userSelects = 0;
  process.env.APP_URL = "https://myimpact.uk";
  process.env.SESSION_SECRET ||= "test-secret-for-unsubscribe-tokens";
  delete process.env.EMAIL_MONTHLY_PROMPT_LIVE;
  delete process.env.EMAIL_MONTHLY_PROMPT_TEST_TO;
  delete process.env.EMAIL_ACTIVITY_INBOX;
  delete process.env.EMAIL_ACTIVITY_LIVE;
});

describe("switched off", () => {
  it("sends nothing and does not even look anyone up", async () => {
    expect(await runMonthlyActivityPrompt([])).toBe(true);
    expect(state.userSelects).toBe(0);
    expect(state.sends).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});

describe("a test run (EMAIL_MONTHLY_PROMPT_TEST_TO)", () => {
  beforeEach(() => {
    process.env.EMAIL_MONTHLY_PROMPT_TEST_TO = "jo@example.org";
  });

  it("emails only the listed account and records nothing, so it can be repeated", async () => {
    expect(await runMonthlyActivityPrompt([])).toBe(true);
    expect(state.sends.map((s) => s.to)).toEqual(["jo@example.org"]);
    expect(state.updates).toHaveLength(0);
    expect(await runMonthlyActivityPrompt([])).toBe(true);
    expect(state.sends.map((s) => s.to)).toEqual(["jo@example.org", "jo@example.org"]);
  });

  it("sends it as a monthly prompt, with a working one-click unsubscribe", async () => {
    await runMonthlyActivityPrompt([]);
    expect(state.categories).toEqual(["monthly-prompt"]);
    const sent = state.sends[0]!;
    expect(sent.from).toBe("My Impact <team@example.org>");
    expect(String(sent.subject)).toMatch(/^Anything to add for [A-Z][a-z]+\?$/);
    const headers = sent.headers as Record<string, string>;
    expect(headers["List-Unsubscribe"]).toMatch(/^<https:\/\/myimpact\.uk\/api\/profile\/unsubscribe\?token=.+>$/);
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(String(sent.text)).toContain("https://myimpact.uk/unsubscribe?token=");
  });

  it("only invites a reply, and sends replies to the activity inbox, when the inbox reads members' emails", async () => {
    await runMonthlyActivityPrompt([]);
    expect(state.sends[0]).not.toHaveProperty("replyTo");
    expect(String(state.sends[0]!.text)).not.toMatch(/reply/i);

    process.env.EMAIL_ACTIVITY_INBOX = "log@myimpact.uk";
    await runMonthlyActivityPrompt([]);
    // The inbox exists but only reads test senders: still no invitation.
    expect(state.sends[1]).not.toHaveProperty("replyTo");

    process.env.EMAIL_ACTIVITY_LIVE = "true";
    await runMonthlyActivityPrompt([]);
    expect(state.sends[2]!.replyTo).toBe("log@myimpact.uk");
    expect(String(state.sends[2]!.text)).toContain("reply to this email");
  });
});

describe("a live run (EMAIL_MONTHLY_PROMPT_LIVE=true)", () => {
  beforeEach(() => {
    process.env.EMAIL_MONTHLY_PROMPT_LIVE = "true";
  });

  it("claims the month for each member, then emails them", async () => {
    expect(await runMonthlyActivityPrompt([])).toBe(true);
    expect(state.sends.map((s) => s.to).sort()).toEqual(["jo@example.org", "sam@example.org"]);
    expect(state.updates.map((u) => u.userId).sort()).toEqual(["u1", "u2"]);
    for (const u of state.updates) expect(u.values.lastActivityPromptSentAt).toBeInstanceOf(Date);
  });

  it("does not email someone another run has already claimed", async () => {
    state.claimedElsewhere = ["u1"];
    expect(await runMonthlyActivityPrompt([])).toBe(true);
    expect(state.sends.map((s) => s.to)).toEqual(["sam@example.org"]);
  });

  it("skips people who had it this month, opted out, are new, or can't be delivered to", async () => {
    state.users = [
      user("u1", "jo@example.org", { lastSentAt: new Date() }),
      user("u2", "sam@example.org", { optIn: false }),
      user("u3", "new@example.org", { createdAt: new Date() }),
      user("u4", "bounced@example.org"),
      user("u5", "demo@demo.org"),
      user("u6", "ok@example.org"),
    ];
    state.suppressed = ["bounced@example.org"];
    expect(await runMonthlyActivityPrompt([])).toBe(true);
    expect(state.sends.map((s) => s.to)).toEqual(["ok@example.org"]);
  });

  it("gives the month back when a send fails, and reports the failure so the run is retried", async () => {
    state.failFor = ["jo@example.org"];
    expect(await runMonthlyActivityPrompt([])).toBe(false);
    expect(state.sends.map((s) => s.to).sort()).toEqual(["jo@example.org", "sam@example.org"]);
    const forJo = state.updates.filter((u) => u.userId === "u1").map((u) => u.values.lastActivityPromptSentAt);
    // Claimed, then released back to what it was (never sent).
    expect(forJo).toHaveLength(2);
    expect(forJo[0]).toBeInstanceOf(Date);
    expect(forJo[1]).toBeNull();
    expect(state.updates.filter((u) => u.userId === "u2")).toHaveLength(1);
  });

  it("sends and claims nothing on a dry run", async () => {
    expect(await runMonthlyActivityPrompt(["--dry-run"])).toBe(true);
    expect(state.sends).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});
