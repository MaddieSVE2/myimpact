/**
 * The background jobs that must run on time, and when each is due.
 *
 * The API is an autoscale deployment, so it sleeps when idle and cannot run
 * timers. Instead a GitHub Actions workflow (.github/workflows/
 * scheduled-jobs.yml) calls the API every hour: it asks which jobs are due,
 * then asks the API to run each one (src/jobs/runner.ts). When each job
 * last started and last succeeded is recorded, so a failed job is retried on
 * a later run instead of waiting for its next slot. All times are UTC. See
 * SCHEDULING.md.
 */

export type JobSchedule =
  /** Every hourly run. For jobs that are safe to repeat. */
  | { kind: "everyRun" }
  /**
   * Once a day, on the first run at or after `hourUTC`. With `retryBackoff`,
   * a failure waits RETRY_BACKOFF_MS before the next try.
   */
  | { kind: "daily"; hourUTC: number; retryBackoff?: boolean }
  /** Once a month, from the 1st at `hourUTC` until `lastDayOfMonth`. */
  | { kind: "monthly"; hourUTC: number; lastDayOfMonth: number };

export interface JobHistory {
  lastAttempt: Date | null;
  lastSuccess: Date | null;
}

export const SCHEDULED_JOB_IDS = [
  "onboarding-emails",
  "calendar-sync",
  "approval-digest",
  "push-reminders",
  "monthly-digest",
  "database-backup",
  "retention-cleanup",
] as const;

export type ScheduledJobId = (typeof SCHEDULED_JOB_IDS)[number];

export interface JobSpec {
  id: ScheduledJobId;
  /** Flags passed to the job, as on its CLI script. */
  args: (env: NodeJS.ProcessEnv) => string[];
  schedule: JobSchedule;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * After a failure, wait this long before retrying the monthly digest or the
 * backup: both email a failure notice, so retrying every hour would flood
 * the inbox.
 */
export const RETRY_BACKOFF_MS = 6 * HOUR_MS;

export const SCHEDULED_JOBS: readonly JobSpec[] = [
  // Each (user, step) is sent once, and missed days are caught up.
  { id: "onboarding-emails", args: () => [], schedule: { kind: "everyRun" } },
  // Idempotent upserts. The job recommends every 15 to 30 minutes.
  { id: "calendar-sync", args: () => ["--prune"], schedule: { kind: "everyRun" } },
  // Has its own 7-day cooldown per organisation.
  { id: "approval-digest", args: () => [], schedule: { kind: "daily", hourUTC: 8 } },
  // The streak nudge only fires after 18:00 UTC, and neither push records a
  // send, so this must run once a day.
  { id: "push-reminders", args: () => [], schedule: { kind: "daily", hourUTC: 18 } },
  {
    id: "monthly-digest",
    args: (env) => ["--skip-recently-sent", ...(env.BACKUP_NOTIFY_EMAIL ? ["--notify"] : [])],
    schedule: { kind: "monthly", hourUTC: 8, lastDayOfMonth: 3 },
  },
  // Production database to App Storage; keeps 30 days.
  { id: "database-backup", args: () => [], schedule: { kind: "daily", hourUTC: 2, retryBackoff: true } },
  // 90-day analytics retention and the 12-month email log. The API also
  // runs the analytics part on startup.
  { id: "retention-cleanup", args: () => [], schedule: { kind: "daily", hourUTC: 3 } },
];

export function isScheduledJobId(value: string): value is ScheduledJobId {
  return (SCHEDULED_JOB_IDS as readonly string[]).includes(value);
}

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
      return (
        now.getTime() >= slot.getTime() &&
        !succeededSince(history, slot) &&
        !(schedule.retryBackoff && inBackoff(history, now))
      );
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
  }
}
