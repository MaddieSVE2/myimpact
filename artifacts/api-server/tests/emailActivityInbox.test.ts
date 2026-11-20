/**
 * The activity inbox handler (lib/emailActivityInbox.ts) against a fake
 * database: who is read, whose record an email is added to, and that a
 * sender who can't be verified never adds anything.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  /** False makes the claim insert find the email already stored (a webhook retry). */
  claims: true,
  /** email_activity_messages rows, as inserted and then updated by the handler. */
  messages: [] as Row[],
  /** Results for each select from email_activity_messages, in the order they run. */
  messageSelects: [] as Row[][],
  /** impact_records rows the handler inserted. */
  records: [] as Row[],
  /** Accounts by email. */
  users: {} as Record<string, { id: string }>,
  /** The addresses accounts were looked up by. */
  lookups: [] as unknown[],
  teamEmails: [] as Row[],
}));

/** The values bound into a drizzle condition, e.g. the email in eq(users.email, x). */
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
  const selectFrom = (table: unknown) => {
    const rows = () => (table === real.emailActivityMessagesTable ? state.messageSelects.shift() ?? [] : []);
    return {
      where: () => {
        const result = rows();
        return { then: (ok: (r: Row[]) => unknown) => Promise.resolve(result).then(ok), orderBy: async () => result };
      },
    };
  };
  const db = {
    insert: (table: unknown) => ({
      values: (row: Row) => {
        if (table === real.emailActivityMessagesTable) {
          return {
            onConflictDoNothing: () => ({
              returning: async () => {
                if (!state.claims) return [];
                const id = state.messages.length + 1;
                state.messages.push({ id, ...row });
                return [{ id }];
              },
            }),
          };
        }
        return {
          returning: async () => {
            const id = 100 + state.records.length;
            state.records.push({ id, ...row });
            return [{ id }];
          },
        };
      },
    }),
    // The handler only ever updates the email it is handling: the latest row.
    update: () => ({ set: (values: Row) => ({ where: async () => Object.assign(state.messages.at(-1)!, values) }) }),
    select: () => ({ from: selectFrom }),
    query: {
      usersTable: {
        findFirst: async (opts: { where: unknown }) => {
          const [email] = paramsOf(opts.where);
          state.lookups.push(email);
          return state.users[String(email)];
        },
      },
      organisationsTable: { findFirst: async () => undefined },
    },
  };
  return { ...real, db };
});

vi.mock("../src/lib/orgGroups.js", () => ({ activeOrgIdFor: async () => null, defaultGroupFor: async () => null }));
vi.mock("../src/lib/recordHelpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/recordHelpers.js")>()),
  autoVerifyRecordsForUser: async () => {},
  oneOffValuation: async () => ({ oneOff: true, householdsCountedThisYear: new Set<string>() }),
}));
vi.mock("../src/routes/auth.js", () => ({ isPersonaEmail: (email: string) => email === "demo@demo.org" }));
vi.mock("../src/lib/aiJson.js", () => ({ completeJson: async () => null }));
vi.mock("../src/lib/resend.js", () => ({
  getUncachableResendClient: async () => ({
    fromEmail: "My Impact <x@example.org>",
    client: { emails: { send: async (payload: Row) => (state.teamEmails.push(payload), { data: { id: "re_1" }, error: null }) } },
  }),
}));

import { handleActivityEmail, sendActivityReply, type ActivityInboxDeps } from "../src/lib/emailActivityInbox.js";
import { ACTIVITIES } from "../src/lib/impactData.js";

const INBOX = "log@myimpact.uk";
const MEMBER = "jo@example.org";
const PASS = { spf: "pass", dkim: "pass", dmarc: "pass" };
const hourly = ACTIVITIES.find((a) => a.unit === "hour")!;

const event = (from = MEMBER) => ({
  email_id: "rcv_1",
  from: `Jo Bloggs <${from}>`,
  to: [INBOX],
  subject: "Volunteering",
  created_at: "2026-11-20T10:00:00.000Z",
  message_id: "<CAF123@mail.gmail.com>",
});

/** The model reading a complete email: two hours yesterday, online. */
const readyAnswer = {
  outcome: "ready",
  acknowledgement: "Thanks for letting me know.",
  items: [{ type: "activity", activityId: hourly.id, date: "2026-11-19", hours: 2, quantity: null, location: { mode: "online" }, note: null }],
};

function makeDeps(authentication: ActivityInboxDeps["fetchEmail"] extends (id: string) => Promise<infer R> ? NonNullable<R>["authentication"] : never) {
  const sent: { to: string; subject: string; text: string; inReplyTo?: string | null }[] = [];
  const deps = {
    fetchEmail: vi.fn(async () => ({ text: "Did two hours yesterday, online", authentication })),
    interpret: vi.fn(async () => readyAnswer as Record<string, unknown>),
    send: vi.fn(async (message: { to: string; subject: string; text: string; inReplyTo?: string | null }) => void sent.push(message)),
    isAllowedAccount: (email: string) => email === "demo@demo.org",
  };
  return { deps, sent };
}

beforeEach(() => {
  state.claims = true;
  state.messages = [];
  state.messageSelects = [];
  state.records = [];
  state.users = { [MEMBER]: { id: "user-jo" }, "demo@demo.org": { id: "user-demo" } };
  state.lookups = [];
  state.teamEmails = [];
  process.env.EMAIL_ACTIVITY_INBOX = INBOX;
  process.env.APP_URL = "https://myimpact.uk";
  delete process.env.EMAIL_ACTIVITY_TEST_SENDERS;
  delete process.env.EMAIL_ACTIVITY_LIVE;
  delete process.env.EMAIL_REPLY_FORWARD_TO;
  delete process.env.EMAIL_REPLY_TO;
});

describe("when the inbox is off or the email is not for it", () => {
  it("does nothing without EMAIL_ACTIVITY_INBOX", async () => {
    delete process.env.EMAIL_ACTIVITY_INBOX;
    const { deps } = makeDeps(PASS);
    expect(await handleActivityEmail(event(), deps)).toBe("ignored");
    expect(state.messages).toHaveLength(0);
  });

  it("leaves mail for other inboxes alone", async () => {
    const { deps } = makeDeps(PASS);
    expect(await handleActivityEmail({ ...event(), to: ["reply@myimpact.uk"] }, deps)).toBe("ignored");
    expect(state.messages).toHaveLength(0);
  });

  it("handles a webhook retry once", async () => {
    state.claims = false;
    const { deps } = makeDeps(PASS);
    expect(await handleActivityEmail(event(), deps)).toBe("duplicate");
    expect(deps.fetchEmail).not.toHaveBeenCalled();
  });
});

describe("test mode (EMAIL_ACTIVITY_LIVE not set)", () => {
  it("ignores a member who is not on the test list, without reading or answering", async () => {
    const { deps } = makeDeps(PASS);
    expect(await handleActivityEmail(event(), deps)).toBe("handled");
    expect(state.messages[0]).toMatchObject({ outcome: "ignored", note: "Sender is not on the test list." });
    expect(state.lookups).toEqual([]);
    expect(deps.fetchEmail).not.toHaveBeenCalled();
    expect(deps.interpret).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
    expect(state.records).toHaveLength(0);
  });

  it("adds a listed test sender's email to the demo account", async () => {
    process.env.EMAIL_ACTIVITY_TEST_SENDERS = `${MEMBER}=demo@demo.org`;
    const { deps, sent } = makeDeps(null);
    await handleActivityEmail(event(), deps);
    expect(state.lookups).toEqual(["demo@demo.org"]);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]).toMatchObject({ userId: "user-demo", kind: "quick_log", name: "Logged by email" });
    expect(state.messages[0]).toMatchObject({ outcome: "logged", recordIds: [100], userId: "user-demo" });
    expect(sent[0]!.to).toBe(MEMBER);
  });
});

describe("live mode (EMAIL_ACTIVITY_LIVE=true)", () => {
  beforeEach(() => {
    process.env.EMAIL_ACTIVITY_LIVE = "true";
  });

  it("adds a verified member's email to their own record and tells them", async () => {
    const { deps, sent } = makeDeps(PASS);
    expect(await handleActivityEmail(event(), deps)).toBe("handled");
    expect(state.lookups).toEqual([MEMBER]);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]).toMatchObject({ userId: "user-jo", kind: "quick_log", totalHours: 2 });
    expect(new Date(state.records[0]!.entryDate as Date).toISOString()).toBe("2026-11-19T00:00:00.000Z");
    expect(state.messages[0]).toMatchObject({ outcome: "logged", recordIds: [100], userId: "user-jo" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: MEMBER, subject: "Re: Volunteering", inReplyTo: "<CAF123@mail.gmail.com>" });
    expect(sent[0]!.text).toContain("I've added it to your My Impact record");
    expect(sent[0]!.text).toContain("https://myimpact.uk/history");
  });

  it("accepts a DKIM pass where the domain publishes no DMARC policy", async () => {
    const { deps } = makeDeps({ spf: "gray", dkim: "pass", dmarc: "gray" });
    await handleActivityEmail(event(), deps);
    expect(state.records).toHaveLength(1);
  });

  it.each([
    ["DMARC failed", { spf: "pass", dkim: "pass", dmarc: "fail" }],
    ["only SPF passed", { spf: "pass", dkim: "gray", dmarc: "gray" }],
    ["Resend gave no checks", null],
  ])("adds nothing when the sender can't be verified: %s", async (_name, authentication) => {
    const { deps, sent } = makeDeps(authentication);
    expect(await handleActivityEmail(event(), deps)).toBe("handled");
    expect(state.records).toHaveLength(0);
    expect(deps.interpret).not.toHaveBeenCalled();
    expect(state.messages[0]).toMatchObject({ outcome: "unverified" });
    // Nothing a forger wrote is kept against the member.
    expect(state.messages[0]!.textBody).toBeUndefined();
    expect(state.messages[0]!.userId).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("couldn't confirm this email came from your address");
    expect(sent[0]!.text).toContain("https://myimpact.uk/log");
  });

  it("tells an unverified sender only once a day", async () => {
    // Selects in order: today's emails from them, then earlier "unverified" ones.
    state.messageSelects = [[], [{ id: 7 }]];
    const { deps, sent } = makeDeps(null);
    await handleActivityEmail(event(), deps);
    expect(state.messages[0]).toMatchObject({ outcome: "unverified", note: expect.stringContaining("Already told today.") });
    expect(sent).toHaveLength(0);
    expect(state.records).toHaveLength(0);
  });

  it("tells a verified sender with no account once, and adds nothing", async () => {
    const { deps, sent } = makeDeps(PASS);
    await handleActivityEmail(event("stranger@example.org"), deps);
    expect(state.lookups).toEqual(["stranger@example.org"]);
    expect(state.messages[0]).toMatchObject({ outcome: "no_account", note: "No account has this address. Told them." });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("stranger@example.org");
    expect(sent[0]!.text).toContain("couldn't find a My Impact account for this email address");
    expect(deps.interpret).not.toHaveBeenCalled();
    expect(state.records).toHaveLength(0);
  });

  it("never writes to an unverified address with no account", async () => {
    const { deps, sent } = makeDeps({ spf: "fail", dkim: "fail", dmarc: "fail" });
    await handleActivityEmail(event("stranger@example.org"), deps);
    expect(state.messages[0]).toMatchObject({ outcome: "no_account", note: expect.stringContaining("Not told") });
    expect(sent).toHaveLength(0);
  });

  it("stays quiet for an address already told this week, and once too many strangers have written today", async () => {
    // Selects: today's emails from them, then their earlier "no_account" ones.
    state.messageSelects = [[], [{ id: 3 }]];
    const first = makeDeps(PASS);
    await handleActivityEmail(event("stranger@example.org"), first.deps);
    expect(first.sent).toHaveLength(0);
    expect(first.deps.fetchEmail).not.toHaveBeenCalled();

    // Selects: today's from them, their earlier ones (none), everyone's today (at the cap).
    state.messageSelects = [[], [], Array.from({ length: 20 }, (_, i) => ({ id: i }))];
    const second = makeDeps(PASS);
    await handleActivityEmail({ ...event("other@example.org"), email_id: "rcv_2" }, second.deps);
    expect(second.sent).toHaveLength(0);
    expect(state.messages.at(-1)).toMatchObject({ outcome: "no_account", note: expect.stringContaining("too many") });
  });

  it("never treats mail claiming to be from a demo account as that account's", async () => {
    const { deps } = makeDeps(PASS);
    await handleActivityEmail(event("demo@demo.org"), deps);
    expect(state.messages[0]).toMatchObject({ outcome: "ignored", note: "Demo accounts can't send email." });
    expect(state.lookups).toEqual([]);
    expect(state.records).toHaveLength(0);
  });

  it("still sends a listed test sender to the demo account, not their own", async () => {
    process.env.EMAIL_ACTIVITY_TEST_SENDERS = `${MEMBER}=demo@demo.org`;
    const { deps } = makeDeps(PASS);
    await handleActivityEmail(event(), deps);
    expect(state.lookups).toEqual(["demo@demo.org"]);
    expect(state.records[0]).toMatchObject({ userId: "user-demo" });
  });

  it("stops reading a sender after 30 emails in a day", async () => {
    state.messageSelects = [Array.from({ length: 31 }, (_, i) => ({ id: i }))];
    const { deps } = makeDeps(PASS);
    await handleActivityEmail(event(), deps);
    expect(state.messages[0]).toMatchObject({ outcome: "ignored", note: "Over the daily limit for this sender." });
    expect(deps.fetchEmail).not.toHaveBeenCalled();
    expect(state.records).toHaveLength(0);
  });

  it("never answers automatic replies", async () => {
    const { deps, sent } = makeDeps(PASS);
    await handleActivityEmail({ ...event(), subject: "Automatic reply: Volunteering" }, deps);
    expect(state.messages[0]).toMatchObject({ outcome: "ignored" });
    expect(sent).toHaveLength(0);
    expect(state.records).toHaveLength(0);
  });

  it("adds nothing when the email can't be fetched, and passes it to the team", async () => {
    process.env.EMAIL_REPLY_FORWARD_TO = "team@example.org";
    const { deps, sent } = makeDeps(PASS);
    deps.fetchEmail.mockRejectedValueOnce(new Error("Resend responded 500"));
    await handleActivityEmail(event(), deps);
    expect(state.records).toHaveLength(0);
    expect(deps.interpret).not.toHaveBeenCalled();
    expect(state.messages[0]).toMatchObject({ outcome: "needs_review" });
    expect(state.teamEmails).toHaveLength(1);
    expect(state.teamEmails[0]).toMatchObject({ to: ["team@example.org"], replyTo: MEMBER });
    expect(sent[0]!.text).toContain("passed it to the My Impact team");
  });

  it("asks a question instead of adding an incomplete email, and logs once it is answered", async () => {
    const { deps, sent } = makeDeps(PASS);
    deps.interpret.mockResolvedValueOnce({ outcome: "ask", question: "Thanks. How long were you there?", items: [] });
    await handleActivityEmail(event(), deps);
    expect(state.records).toHaveLength(0);
    expect(state.messages[0]).toMatchObject({ outcome: "asked", question: "Thanks. How long were you there?" });
    // The question goes on its own, as a reply would: no sign-off.
    expect(sent[0]!.text).toBe("Thanks. How long were you there?");

    // The answer arrives: today's emails, then the open conversation (newest first).
    state.messageSelects = [[], [{ ...state.messages[0], receivedAt: new Date("2026-11-20T10:00:00Z") }]];
    await handleActivityEmail({ ...event(), email_id: "rcv_2", created_at: "2026-11-20T11:00:00.000Z" }, deps);
    const conversation = deps.interpret.mock.calls.at(-1)![0];
    expect(conversation.map((m: { role: string }) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(state.records).toHaveLength(1);
    expect(state.messages[1]).toMatchObject({ outcome: "logged" });
  });
});

describe("sendActivityReply", () => {
  const message = { to: MEMBER, subject: "Re: Volunteering", text: "Thanks. When did you do this?", inReplyTo: "<CAF123@mail.gmail.com>" };
  const FALLBACK = "My Impact <team@example.org>";
  const HOUR = 60 * 60 * 1000;

  function fakeClient(refuseInboxSender: { name: string; message: string } | null) {
    const sends: Row[] = [];
    const client = {
      emails: {
        send: async (payload: Row) => {
          sends.push(payload);
          const refused = refuseInboxSender && String(payload.from).includes(INBOX);
          return refused ? { data: null, error: refuseInboxSender } : { data: { id: "re_1" }, error: null };
        },
      },
    } as unknown as Parameters<typeof sendActivityReply>[0];
    return { client, sends };
  }

  it("replies from the inbox's own address, under the member's email", async () => {
    const { client, sends } = fakeClient(null);
    await sendActivityReply(client, FALLBACK, message, 100 * HOUR);
    expect(sends).toEqual([
      {
        from: "My Impact <log@myimpact.uk>",
        to: MEMBER,
        replyTo: INBOX,
        subject: "Re: Volunteering",
        text: "Thanks. When did you do this?",
        headers: { "In-Reply-To": "<CAF123@mail.gmail.com>", References: "<CAF123@mail.gmail.com>" },
      },
    ]);
  });

  it("still sends, from the usual address, when Resend refuses the inbox's address, and stops trying it for an hour", async () => {
    const { client, sends } = fakeClient({ name: "validation_error", message: "The myimpact.uk domain is not verified." });
    await sendActivityReply(client, FALLBACK, message, 200 * HOUR);
    expect(sends.map((s) => s.from)).toEqual(["My Impact <log@myimpact.uk>", FALLBACK]);
    expect(sends[1]).toMatchObject({ to: MEMBER, replyTo: INBOX, headers: { "In-Reply-To": "<CAF123@mail.gmail.com>" } });

    await sendActivityReply(client, FALLBACK, message, 200 * HOUR + 60_000);
    expect(sends.map((s) => s.from)).toEqual(["My Impact <log@myimpact.uk>", FALLBACK, FALLBACK]);

    await sendActivityReply(client, FALLBACK, message, 202 * HOUR);
    expect(sends.slice(3).map((s) => s.from)).toEqual(["My Impact <log@myimpact.uk>", FALLBACK]);
  });

  it("keeps trying the inbox's address after a failure that is not about the sender", async () => {
    const { client, sends } = fakeClient({ name: "rate_limit_exceeded", message: "Too many requests" });
    await sendActivityReply(client, FALLBACK, message, 300 * HOUR);
    await sendActivityReply(client, FALLBACK, message, 300 * HOUR + 1000);
    expect(sends.map((s) => s.from)).toEqual(["My Impact <log@myimpact.uk>", FALLBACK, "My Impact <log@myimpact.uk>", FALLBACK]);
  });

  it("fails when neither address can send", async () => {
    const client = { emails: { send: async () => ({ data: null, error: { name: "application_error", message: "Resend is down" } }) } } as unknown as Parameters<typeof sendActivityReply>[0];
    await expect(sendActivityReply(client, FALLBACK, message, 400 * HOUR)).rejects.toThrow("Resend is down");
  });

  it("sends without thread headers when the email had no usable message id", async () => {
    const { client, sends } = fakeClient(null);
    await sendActivityReply(client, FALLBACK, { ...message, inReplyTo: null }, 500 * HOUR);
    expect(sends[0]).not.toHaveProperty("headers");
  });
});
