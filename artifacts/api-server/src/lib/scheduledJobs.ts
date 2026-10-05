/**
 * The background jobs that run outside the web server, and when each is due.
 *
 * One Replit Scheduled Deployment runs scripts/run-scheduled-jobs.ts every
 * hour. Each run asks `isJobDue` about every job below, runs the due ones
 * and records when each last started and last succeeded, so a failed job is
 * retried on a later run instead of waiting for its next slot. All times are
 * UTC. See SCHEDULING.md for the Replit setup.
 */

export type JobSchedule =
  /** Every hourly run. For jobs that are safe to repeat. */
  | { kind: "everyRun" }
  /** Once a day, on the first run at or after `hourUTC`. */
  | { kind: "daily"; hourUTC: number }
  /** Once a month, from the 1st at `hourUTC` until `lastDayOfMonth`. */
  | { kind: "monthly"; hourUTC: number; lastDayOfMonth: number }
  /** Once every 7 days. */
  | { kind: "weekly" };

export interface JobHistory {
  lastAttempt: Date | null;
  lastSuccess: Date | null;
}

export interface JobSpec {
  id: string;
  /** File in src/scripts. */
  script: string;
  args: (env: NodeJS.ProcessEnv) => string[];
  schedule: JobSchedule;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * After a failure, wait this long before retrying a weekly or monthly job.
 * Both email a failure notice, so retrying every hour would flood the inbox.
 */
export const RETRY_BACKOFF_MS = 6 * HOUR_MS;

// --notify makes the backup fail outright when no recipient is set, so only
// pass it when there is one.
const notify = (env: NodeJS.ProcessEnv) => (env.BACKUP_NOTIFY_EMAIL ? ["--notify"] : []);

export const SCHEDULED_JOBS: readonly JobSpec[] = [
  // Each (user, step) is sent once, and missed days are caught up.
  { id: "onboarding-emails", script: "onboarding-emails.ts", args: () => [], schedule: { kind: "everyRun" } },
  // Idempotent upserts. The script recommends every 15 to 30 minutes.
  { id: "calendar-sync", script: "sync-calendars.ts", args: () => ["--prune"], schedule: { kind: "everyRun" } },
  // Has its own 7-day cooldown per organisation.
  { id: "approval-digest", script: "approval-digest.ts", args: () => [], schedule: { kind: "daily", hourUTC: 8 } },
  // The streak nudge only fires after 18:00 UTC, and neither push records a
  // send, so this must run once a day.
  { id: "push-reminders", script: "send-push-reminders.ts", args: () => [], schedule: { kind: "daily", hourUTC: 18 } },
  {
    id: "monthly-digest",
    script: "send-monthly-digest.ts",
    args: (env) => ["--skip-recently-sent", ...notify(env)],
    schedule: { kind: "monthly", hourUTC: 8, lastDayOfMonth: 3 },
  },
  {
    id: "database-backup",
    script: "backup-db.ts",
    args: (env) => ["--prune", "--keep", "12", ...notify(env)],
    schedule: { kind: "weekly" },
  },
];

function atHourUTC(day: Date, hourUTC: number): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hourUTC));
}

/** True when the last attempt failed and the backoff has not passed yet. */
function inBackoff(history: JobHistory, now: Date): boolean {
  const { lastAttempt, lastSuccess } = history;
  if (!lastAttempt) return false;
  if (lastSuccess && lastSuccess.getTime() >= lastAttempt.getTime()) return false;
  return now.getTime() - lastAttempt.getTime() < RETRY_BACKOFF_MS;
}

function succeededSince(history: JobHistory, slot: Date): boolean {
  return history.lastSuccess !== null && history.lastSuccess.getTime() >= slot.getTime();
}

export function isJobDue(schedule: JobSchedule, history: JobHistory, now: Date): boolean {
  switch (schedule.kind) {
    case "everyRun":
      return true;
    case "daily": {
      const slot = atHourUTC(now, schedule.hourUTC);
      return now.getTime() >= slot.getTime() && !succeededSince(history, slot);
    }
    case "monthly": {
      const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const slot = atHourUTC(firstOfMonth, schedule.hourUTC);
      return (
        now.getTime() >= slot.getTime() &&
        now.getUTCDate() <= schedule.lastDayOfMonth &&
        !succeededSince(history, slot) &&
        !inBackoff(history, now)
      );
    }
    case "weekly": {
      const sinceSuccess = history.lastSuccess ? now.getTime() - history.lastSuccess.getTime() : Infinity;
      return sinceSuccess >= 7 * DAY_MS && !inBackoff(history, now);
    }
  }
}
