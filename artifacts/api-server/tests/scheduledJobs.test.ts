import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCHEDULED_JOBS,
  RETRY_BACKOFF_MS,
  isJobDue,
  type JobHistory,
  type JobSchedule,
} from "../src/lib/scheduledJobs.js";
import { ONBOARDING_STEPS, ONBOARDING_CATCH_UP_DAYS, onboardingSignupWindow } from "../src/lib/onboardingEmails.js";
import { dueOccurrence } from "../src/lib/recurringSchedule.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const utc = (iso: string) => new Date(`${iso}Z`);
const never: JobHistory = { lastAttempt: null, lastSuccess: null };
const succeeded = (at: Date): JobHistory => ({ lastAttempt: at, lastSuccess: at });
const failed = (at: Date, lastSuccess: Date | null = null): JobHistory => ({ lastAttempt: at, lastSuccess });

describe("isJobDue", () => {
  it("runs everyRun jobs on every run", () => {
    expect(isJobDue({ kind: "everyRun" }, succeeded(utc("2026-10-05T10:00:00")), utc("2026-10-05T10:00:00"))).toBe(true);
  });

  describe("daily", () => {
    const daily: JobSchedule = { kind: "daily", hourUTC: 18 };
    it("waits for the slot hour", () => {
      expect(isJobDue(daily, never, utc("2026-10-05T17:59:00"))).toBe(false);
      expect(isJobDue(daily, never, utc("2026-10-05T18:00:00"))).toBe(true);
    });
    it("runs once per day after a success", () => {
      const history = succeeded(utc("2026-10-05T18:02:00"));
      expect(isJobDue(daily, history, utc("2026-10-05T19:00:00"))).toBe(false);
      expect(isJobDue(daily, history, utc("2026-10-06T17:00:00"))).toBe(false);
      expect(isJobDue(daily, history, utc("2026-10-06T18:00:00"))).toBe(true);
    });
    it("retries on the next run after a failure", () => {
      const history = failed(utc("2026-10-05T18:02:00"), utc("2026-10-04T18:01:00"));
      expect(isJobDue(daily, history, utc("2026-10-05T19:00:00"))).toBe(true);
    });
  });

  describe("monthly", () => {
    const monthly: JobSchedule = { kind: "monthly", hourUTC: 8, lastDayOfMonth: 3 };
    it("starts on the 1st at the slot hour", () => {
      expect(isJobDue(monthly, never, utc("2026-11-01T07:00:00"))).toBe(false);
      expect(isJobDue(monthly, never, utc("2026-11-01T08:00:00"))).toBe(true);
    });
    it("sends once per month", () => {
      const history = succeeded(utc("2026-11-01T08:05:00"));
      expect(isJobDue(monthly, history, utc("2026-11-02T08:00:00"))).toBe(false);
      expect(isJobDue(monthly, history, utc("2026-12-01T08:00:00"))).toBe(true);
    });
    it("gives up after the last catch-up day", () => {
      expect(isJobDue(monthly, never, utc("2026-11-03T23:00:00"))).toBe(true);
      expect(isJobDue(monthly, never, utc("2026-11-04T00:00:00"))).toBe(false);
    });
    it("backs off after a failure instead of retrying every hour", () => {
      const failedAt = utc("2026-11-01T08:00:00");
      const history = failed(failedAt, utc("2026-10-01T08:05:00"));
      expect(isJobDue(monthly, history, new Date(failedAt.getTime() + HOUR))).toBe(false);
      expect(isJobDue(monthly, history, new Date(failedAt.getTime() + RETRY_BACKOFF_MS))).toBe(true);
    });
  });

  describe("weekly", () => {
    const weekly: JobSchedule = { kind: "weekly" };
    it("runs straight away when it has never succeeded", () => {
      expect(isJobDue(weekly, never, utc("2026-10-05T10:00:00"))).toBe(true);
    });
    it("runs again 7 days after the last success", () => {
      const at = utc("2026-10-05T10:00:00");
      expect(isJobDue(weekly, succeeded(at), new Date(at.getTime() + 6 * DAY))).toBe(false);
      expect(isJobDue(weekly, succeeded(at), new Date(at.getTime() + 7 * DAY))).toBe(true);
    });
    it("backs off after a failure", () => {
      const failedAt = utc("2026-10-05T10:00:00");
      expect(isJobDue(weekly, failed(failedAt), new Date(failedAt.getTime() + HOUR))).toBe(false);
      expect(isJobDue(weekly, failed(failedAt), new Date(failedAt.getTime() + RETRY_BACKOFF_MS))).toBe(true);
    });
  });
});

describe("SCHEDULED_JOBS", () => {
  it("points every job at a script that exists", () => {
    const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/scripts");
    for (const job of SCHEDULED_JOBS) {
      expect(fs.existsSync(path.join(scriptsDir, job.script)), job.script).toBe(true);
    }
  });

  it("only asks the backup and digest to notify when a recipient is set", () => {
    const backup = SCHEDULED_JOBS.find((j) => j.id === "database-backup")!;
    const digest = SCHEDULED_JOBS.find((j) => j.id === "monthly-digest")!;
    expect(backup.args({})).not.toContain("--notify");
    expect(digest.args({})).not.toContain("--notify");
    expect(backup.args({ BACKUP_NOTIFY_EMAIL: "ops@example.org" })).toContain("--notify");
    expect(digest.args({ BACKUP_NOTIFY_EMAIL: "ops@example.org" })).toContain("--notify");
  });

  it("always skips digest recipients already sent this month", () => {
    const digest = SCHEDULED_JOBS.find((j) => j.id === "monthly-digest")!;
    expect(digest.args({})).toContain("--skip-recently-sent");
  });
});

describe("onboardingSignupWindow", () => {
  const now = utc("2026-10-05T12:00:00");

  it("includes someone who signed up exactly N days ago and up to the catch-up limit", () => {
    for (const step of ONBOARDING_STEPS) {
      const { start, end } = onboardingSignupWindow(step, now);
      expect(end.getTime()).toBe(now.getTime() - step * DAY);
      expect(start.getTime()).toBe(now.getTime() - (step + ONBOARDING_CATCH_UP_DAYS) * DAY);
    }
  });

  it("never owes anyone two onboarding emails at once", () => {
    const windows = ONBOARDING_STEPS.map((s) => onboardingSignupWindow(s, now));
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const overlap = windows[i]!.start < windows[j]!.end && windows[j]!.start < windows[i]!.end;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe("dueOccurrence", () => {
  // 2026-10-02 is a Friday (dayOfPeriod 5); 2026-09-28 a Monday.
  const weeklyFriday = {
    cadence: "weekly",
    dayOfPeriod: 5,
    anchorDate: utc("2026-09-28T09:00:00"),
    lastConfirmedAt: null,
    lastSkippedAt: null,
  };

  it("is not due before the template's first occurrence", () => {
    expect(dueOccurrence(weeklyFriday, utc("2026-09-30T12:00:00"))).toBeNull();
  });

  it("is due on the occurrence day and stays due until handled", () => {
    expect(dueOccurrence(weeklyFriday, utc("2026-10-02T12:00:00"))?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(dueOccurrence(weeklyFriday, utc("2026-10-04T12:00:00"))?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });

  it("is silenced by confirming or skipping that occurrence", () => {
    const now = utc("2026-10-02T19:00:00");
    expect(dueOccurrence({ ...weeklyFriday, lastConfirmedAt: utc("2026-10-02T18:00:00") }, now)).toBeNull();
    expect(dueOccurrence({ ...weeklyFriday, lastSkippedAt: utc("2026-10-02T18:00:00") }, now)).toBeNull();
  });

  it("comes back for the next occurrence after one was confirmed", () => {
    const confirmed = { ...weeklyFriday, lastConfirmedAt: utc("2026-10-02T18:00:00") };
    expect(dueOccurrence(confirmed, utc("2026-10-09T08:00:00"))?.toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("follows the fortnightly week pattern from the anchor", () => {
    const fortnightly = { ...weeklyFriday, cadence: "fortnightly", anchorDate: utc("2026-10-02T09:00:00") };
    expect(dueOccurrence(fortnightly, utc("2026-10-09T12:00:00"))?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(dueOccurrence(fortnightly, utc("2026-10-16T12:00:00"))?.toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });

  it("uses the day of the month for monthly templates", () => {
    const monthly = { ...weeklyFriday, cadence: "monthly", dayOfPeriod: 15, anchorDate: utc("2026-09-01T09:00:00") };
    expect(dueOccurrence(monthly, utc("2026-10-14T12:00:00"))?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(dueOccurrence(monthly, utc("2026-10-15T12:00:00"))?.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
});
