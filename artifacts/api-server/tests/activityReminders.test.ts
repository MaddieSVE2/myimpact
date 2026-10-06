import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";
import { getsPushReminders, occurrenceToRemind, ukHour } from "../src/lib/activityReminders.js";
import { buildActivityReminderEmail } from "../src/lib/activityReminderEmail.js";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../src/lib/unsubscribeToken.js";

const utc = (iso: string) => new Date(`${iso}Z`);

// 2026-10-09 and 2026-10-16 are Fridays (dayOfPeriod 5).
const weeklyFriday = {
  cadence: "weekly",
  dayOfPeriod: 5,
  anchorDate: utc("2026-09-28T09:00:00"),
  lastConfirmedAt: null as Date | null,
  lastSkippedAt: null as Date | null,
  lastRemindedOccurrence: null as Date | null,
};

describe("ukHour", () => {
  it("follows British Summer Time and GMT", () => {
    expect(ukHour(utc("2026-10-06T06:00:00"))).toBe(7);
    expect(ukHour(utc("2026-12-01T06:00:00"))).toBe(6);
    expect(ukHour(utc("2026-12-01T07:00:00"))).toBe(7);
  });
});

describe("occurrenceToRemind", () => {
  it("reminds on the day the activity is due", () => {
    expect(occurrenceToRemind(weeklyFriday, utc("2026-10-09T07:30:00"))?.toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("does not chase a missed occurrence the next day", () => {
    expect(occurrenceToRemind(weeklyFriday, utc("2026-10-10T07:30:00"))).toBeNull();
  });

  it("emails each occurrence once", () => {
    const reminded = { ...weeklyFriday, lastRemindedOccurrence: utc("2026-10-09T00:00:00") };
    expect(occurrenceToRemind(reminded, utc("2026-10-09T15:00:00"))).toBeNull();
    expect(occurrenceToRemind(reminded, utc("2026-10-16T07:30:00"))?.toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });

  it("stays quiet once the occurrence is logged or skipped", () => {
    const now = utc("2026-10-09T09:00:00");
    expect(occurrenceToRemind({ ...weeklyFriday, lastConfirmedAt: utc("2026-10-09T08:00:00") }, now)).toBeNull();
    expect(occurrenceToRemind({ ...weeklyFriday, lastSkippedAt: utc("2026-10-09T08:00:00") }, now)).toBeNull();
  });

  it("is quiet on days nothing is scheduled", () => {
    expect(occurrenceToRemind(weeklyFriday, utc("2026-10-07T09:00:00"))).toBeNull();
  });
});

describe("getsPushReminders", () => {
  it("leaves reminders to push only when push is set up and on", () => {
    expect(getsPushReminders(true, 1)).toBe(true);
    expect(getsPushReminders(false, 1)).toBe(false);
    expect(getsPushReminders(true, 0)).toBe(false);
  });
});

describe("buildActivityReminderEmail", () => {
  const ctx = { displayName: "Jo", appUrl: "https://myimpact.example", unsubscribeUrl: "https://myimpact.example/unsubscribe?token=abc" };

  it("names a single activity in the subject", () => {
    const email = buildActivityReminderEmail(ctx, [{ label: "Litter picking", cadence: "weekly" }]);
    expect(email.subject).toBe("Reminder: Litter picking today");
    expect(email.html).toContain("Litter picking</strong> (every week)");
    expect(email.html).toContain(ctx.unsubscribeUrl);
    expect(email.text).toContain("- Litter picking (every week)");
  });

  it("lists several activities in one email", () => {
    const email = buildActivityReminderEmail(ctx, [
      { label: "Litter picking", cadence: "weekly" },
      { label: "Food bank", cadence: "fortnightly" },
    ]);
    expect(email.subject).toBe("Reminder: 2 regular activities today");
    expect(email.html).toContain("Food bank</strong> (every two weeks)");
  });

  it("escapes activity names in the HTML", () => {
    const email = buildActivityReminderEmail(ctx, [{ label: "<b>Hi</b>", cadence: "monthly" }]);
    expect(email.html).not.toContain("<b>Hi</b>");
    expect(email.html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
  });

  it("writes Welsh for Welsh speakers", () => {
    const email = buildActivityReminderEmail({ ...ctx, locale: "cy" }, [{ label: "Casglu sbwriel", cadence: "weekly" }]);
    expect(email.subject).toBe("Nodyn atgoffa: Casglu sbwriel heddiw");
    expect(email.html).toContain("bob wythnos");
  });

  it("uses no em dashes in member copy", () => {
    const email = buildActivityReminderEmail(ctx, [{ label: "Litter picking", cadence: "weekly" }]);
    expect(email.html + email.text + email.subject).not.toContain("—");
  });
});

describe("unsubscribe tokens", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET ||= "test-session-secret";
  });

  it("carries the list it switches off", () => {
    const result = verifyUnsubscribeToken(createUnsubscribeToken("u1", "activity-reminders"));
    expect(result).toEqual({ ok: true, userId: "u1", list: "activity-reminders" });
  });

  it("treats tokens without a list as onboarding, as all older links are", () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken("u1"))).toEqual({ ok: true, userId: "u1", list: "onboarding" });
  });

  it("rejects an unknown list", () => {
    const token = jwt.sign({ sub: "u1", purpose: "email-unsubscribe", list: "everything" }, process.env.SESSION_SECRET!);
    expect(verifyUnsubscribeToken(token)).toEqual({ ok: false, reason: "invalid" });
  });
});
