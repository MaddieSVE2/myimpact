/**
 * The monthly "anything to add?" email: when it is due, who gets it, what
 * it says, and that its unsubscribe link can only switch itself off.
 */
import { describe, it, expect } from "vitest";
import { decidePrompt, monthlyPromptSettings, NEW_ACCOUNT_DAYS, type PromptCandidate } from "../src/lib/monthlyPrompt.js";
import { buildMonthlyPromptEmail, promptMonth } from "../src/lib/monthlyPromptEmail.js";
import { isJobDue, SCHEDULED_JOBS, RETRY_BACKOFF_MS } from "../src/lib/scheduledJobs.js";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../src/lib/unsubscribeToken.js";

const utc = (iso: string) => new Date(`${iso}Z`);
const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe("when it is due", () => {
  const { schedule } = SCHEDULED_JOBS.find((j) => j.id === "monthly-activity-prompt")!;
  const never = { lastAttempt: null, lastSuccess: null };

  it("is due from 09:00 on the 15th until the end of the 17th", () => {
    expect(isJobDue(schedule, never, utc("2026-12-01T09:00:00"))).toBe(false);
    expect(isJobDue(schedule, never, utc("2026-12-14T23:00:00"))).toBe(false);
    expect(isJobDue(schedule, never, utc("2026-12-15T08:00:00"))).toBe(false);
    expect(isJobDue(schedule, never, utc("2026-12-15T09:00:00"))).toBe(true);
    expect(isJobDue(schedule, never, utc("2026-12-17T23:00:00"))).toBe(true);
    expect(isJobDue(schedule, never, utc("2026-12-18T00:00:00"))).toBe(false);
  });

  it("runs once a month", () => {
    const done = { lastAttempt: utc("2026-12-15T09:05:00"), lastSuccess: utc("2026-12-15T09:06:00") };
    expect(isJobDue(schedule, done, utc("2026-12-15T10:05:00"))).toBe(false);
    expect(isJobDue(schedule, done, utc("2026-12-16T09:05:00"))).toBe(false);
    expect(isJobDue(schedule, done, utc("2027-01-15T09:05:00"))).toBe(true);
  });

  it("waits before retrying a failed run", () => {
    const failedAt = utc("2026-12-15T09:05:00");
    const failed = { lastAttempt: failedAt, lastSuccess: null };
    expect(isJobDue(schedule, failed, new Date(failedAt.getTime() + 60 * 60 * 1000))).toBe(false);
    expect(isJobDue(schedule, failed, new Date(failedAt.getTime() + RETRY_BACKOFF_MS))).toBe(true);
  });

  it("leaves the monthly recap on the 1st", () => {
    const digest = SCHEDULED_JOBS.find((j) => j.id === "monthly-digest")!.schedule;
    expect(isJobDue(digest, never, utc("2026-12-01T08:00:00"))).toBe(true);
    expect(isJobDue(digest, never, utc("2026-12-15T09:00:00"))).toBe(false);
  });
});

describe("the switches", () => {
  it("is off until switched on", () => {
    expect(monthlyPromptSettings(env({}))).toEqual({ live: false, testTo: [] });
    expect(monthlyPromptSettings(env({ EMAIL_MONTHLY_PROMPT_LIVE: "yes" })).live).toBe(false);
    expect(monthlyPromptSettings(env({ EMAIL_MONTHLY_PROMPT_LIVE: " True " })).live).toBe(true);
  });

  it("reads the accounts to try it on", () => {
    expect(monthlyPromptSettings(env({ EMAIL_MONTHLY_PROMPT_TEST_TO: " Jo@Example.org, not-an-address ,sam@example.org" })).testTo).toEqual([
      "jo@example.org",
      "sam@example.org",
    ]);
  });
});

describe("who gets it", () => {
  const now = utc("2026-12-15T09:05:00");
  const monthStart = utc("2026-12-01T00:00:00");
  const member: PromptCandidate = { email: "Jo@Example.org", optIn: true, createdAt: utc("2026-06-01T00:00:00"), lastSentAt: null };
  const decide = (user: PromptCandidate, settings = { live: true, testTo: [] as string[] }, suppressed: string[] = []) =>
    decidePrompt(user, {
      settings,
      now,
      monthStart,
      isSuppressed: (email) => suppressed.includes(email),
      isDemo: (email) => email === "demo@demo.org",
    });

  it("goes to members who have not opted out", () => {
    expect(decide(member)).toEqual({ send: true });
    expect(decide({ ...member, optIn: false })).toEqual({ send: false, reason: "opted out" });
  });

  it("goes to each member once a month", () => {
    expect(decide({ ...member, lastSentAt: utc("2026-12-15T09:01:00") })).toEqual({ send: false, reason: "already sent this month" });
    expect(decide({ ...member, lastSentAt: utc("2026-11-15T09:01:00") })).toEqual({ send: true });
  });

  it("leaves new accounts to the onboarding emails", () => {
    expect(NEW_ACCOUNT_DAYS).toBe(14);
    expect(decide({ ...member, createdAt: utc("2026-12-02T00:00:00") })).toEqual({ send: false, reason: "new account" });
    expect(decide({ ...member, createdAt: utc("2026-12-01T09:00:00") })).toEqual({ send: true });
  });

  it("never goes to demo accounts or addresses that can't be delivered to", () => {
    expect(decide({ ...member, email: "demo@demo.org" })).toMatchObject({ send: false });
    expect(decide(member, { live: true, testTo: [] }, ["jo@example.org"])).toMatchObject({ send: false });
    expect(decide(member, { live: false, testTo: ["jo@example.org"] }, ["jo@example.org"])).toMatchObject({ send: false });
  });

  it("goes to nobody while switched off", () => {
    expect(decide(member, { live: false, testTo: [] })).toEqual({ send: false, reason: "not live" });
  });

  it("goes only to the listed accounts in a test, whatever their preference or history", () => {
    const test = { live: false, testTo: ["jo@example.org"] };
    expect(decide(member, test)).toEqual({ send: true });
    expect(decide({ ...member, optIn: false, lastSentAt: now, createdAt: now }, test)).toEqual({ send: true });
    expect(decide({ ...member, email: "sam@example.org" }, test)).toEqual({ send: false, reason: "not live" });
  });

  it("ignores the test list once live", () => {
    const live = { live: true, testTo: ["jo@example.org"] };
    expect(decide({ ...member, optIn: false }, live)).toEqual({ send: false, reason: "opted out" });
    expect(decide({ ...member, email: "sam@example.org" }, live)).toEqual({ send: true });
  });
});

describe("the email", () => {
  const ctx = {
    displayName: "Jo",
    appUrl: "https://myimpact.uk",
    month: "December",
    canReply: true,
    unsubscribeUrl: "https://myimpact.uk/unsubscribe?token=abc",
  };

  it("names the month, in UK time", () => {
    expect(promptMonth(utc("2026-12-15T09:00:00"))).toBe("December");
    // 23:30 UTC on 30 June is already July in the UK.
    expect(promptMonth(utc("2026-06-30T23:30:00"))).toBe("July");
    expect(promptMonth(utc("2026-12-15T09:00:00"), "cy")).toBe("Rhagfyr");
  });

  it("asks, invites a reply, links to the app and says how to stop", () => {
    const { subject, text, html } = buildMonthlyPromptEmail(ctx);
    expect(subject).toBe("Anything to add for December?");
    expect(text).toBe(
      [
        "Hi Jo,",
        "",
        "Have you done anything for others in December that isn't on your My Impact record yet? Volunteering, helping a neighbour, a donation, a fundraiser: it all counts.",
        "",
        'The quickest way to add it is to reply to this email and tell me what you did, when, and roughly how long it took. For example: "I helped at the food bank on Saturday for 3 hours." I\'ll add it to your record and let you know.',
        "",
        "Or add it in My Impact: https://myimpact.uk/log",
        "",
        "Nothing to add this month? No need to do anything.",
        "",
        "You're getting this monthly email because you have a My Impact account. Stop these monthly emails with one click: https://myimpact.uk/unsubscribe?token=abc",
      ].join("\n"),
    );
    expect(html).toContain('href="https://myimpact.uk/log"');
    expect(html).toContain('href="https://myimpact.uk/unsubscribe?token=abc"');
    expect(html).toContain('href="https://myimpact.uk/settings"');
    expect(html).toContain("reply to this email");
  });

  it("does not invite a reply when replies are not read", () => {
    const { text, html } = buildMonthlyPromptEmail({ ...ctx, canReply: false });
    expect(text).not.toMatch(/reply/i);
    expect(html).not.toMatch(/reply to this email/i);
    expect(text).toContain("It only takes a minute or two to add it in My Impact: https://myimpact.uk/log");
  });

  it("greets someone with no name, and escapes a name", () => {
    expect(buildMonthlyPromptEmail({ ...ctx, displayName: null }).text.startsWith("Hi there,")).toBe(true);
    expect(buildMonthlyPromptEmail({ ...ctx, displayName: "<b>Jo</b>" }).html).not.toContain("<b>Jo</b>");
  });

  it("has a Welsh version", () => {
    const { subject, text } = buildMonthlyPromptEmail({ ...ctx, locale: "cy", month: "Rhagfyr" });
    expect(subject).toBe("Unrhyw beth i'w ychwanegu ar gyfer mis Rhagfyr?");
    expect(text.startsWith("Helo Jo,")).toBe(true);
    expect(text).toContain("https://myimpact.uk/log");
    expect(text).toContain("https://myimpact.uk/unsubscribe?token=abc");
  });

  it("keeps to the house style: no em dashes, no exclamation marks", () => {
    for (const locale of ["en", "cy"] as const) {
      for (const canReply of [true, false]) {
        const { subject, text } = buildMonthlyPromptEmail({ ...ctx, locale, canReply });
        expect(subject + text).not.toMatch(/[—!]/);
      }
    }
  });
});

describe("its unsubscribe link", () => {
  it("switches off this email only", () => {
    process.env.SESSION_SECRET ||= "test-secret-for-unsubscribe-tokens";
    expect(verifyUnsubscribeToken(createUnsubscribeToken("u1", "monthly-prompt"))).toEqual({ ok: true, userId: "u1", list: "monthly-prompt" });
    expect(verifyUnsubscribeToken(createUnsubscribeToken("u1", "activity-reminders"))).toMatchObject({ list: "activity-reminders" });
    expect(verifyUnsubscribeToken(createUnsubscribeToken("u1"))).toMatchObject({ list: "onboarding" });
  });
});
