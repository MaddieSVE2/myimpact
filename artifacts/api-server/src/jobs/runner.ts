/**
 * Runs scheduled jobs (see lib/scheduledJobs.ts) inside whichever process
 * calls it: the API server, for the hourly GitHub Actions trigger, or the
 * `jobs:scheduled` CLI for manual runs.
 *
 * When each job last started and last succeeded is kept in ai_alert_state
 * (keys `scheduled_job:<id>:attempt` and `:success`). A Postgres advisory
 * lock lets only one job run at a time across every instance.
 */
import { db, pool, aiAlertStateTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import {
  SCHEDULED_JOBS,
  isJobDue,
  type JobHistory,
  type JobSpec,
  type ScheduledJobId,
} from "../lib/scheduledJobs.js";
import { JOB_RUNNERS } from "./index.js";

const STATE_PREFIX = "scheduled_job:";
// Arbitrary constant identifying the scheduled-jobs advisory lock.
const JOBS_LOCK_ID = 727_001;

const attemptKey = (id: string) => `${STATE_PREFIX}${id}:attempt`;
const successKey = (id: string) => `${STATE_PREFIX}${id}:success`;

async function loadHistory(): Promise<Map<ScheduledJobId, JobHistory>> {
  const keys = SCHEDULED_JOBS.flatMap((j) => [attemptKey(j.id), successKey(j.id)]);
  const rows = await db.select().from(aiAlertStateTable).where(inArray(aiAlertStateTable.key, keys));
  const at = new Map(rows.map((r) => [r.key, r.lastSentAt]));
  return new Map(
    SCHEDULED_JOBS.map((j) => [
      j.id,
      { lastAttempt: at.get(attemptKey(j.id)) ?? null, lastSuccess: at.get(successKey(j.id)) ?? null },
    ]),
  );
}

async function stamp(key: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO ai_alert_state (key, last_sent_at)
    VALUES (${key}, NOW())
    ON CONFLICT (key) DO UPDATE SET last_sent_at = NOW()
  `);
}

/** The jobs due now, in the order they should run. */
export async function dueJobIds(now = new Date()): Promise<ScheduledJobId[]> {
  const history = await loadHistory();
  return SCHEDULED_JOBS.filter((j) => isJobDue(j.schedule, history.get(j.id)!, now)).map((j) => j.id);
}

export type JobRunResult =
  | { status: "ran"; ok: boolean; ms: number; error?: string }
  | { status: "not-due" }
  | { status: "busy" };

/**
 * Runs one job if it is still due (or always, with `force`). Returns "busy"
 * when another job holds the lock.
 */
export async function runScheduledJob(id: ScheduledJobId, opts: { force?: boolean } = {}): Promise<JobRunResult> {
  const spec: JobSpec = SCHEDULED_JOBS.find((j) => j.id === id)!;
  const lockClient = await pool.connect();
  // A connection that may still hold the lock must not go back to the pool.
  let discard = false;
  try {
    const { rows } = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [
      JOBS_LOCK_ID,
    ]);
    if (!rows[0]?.locked) return { status: "busy" };
    try {
      if (!opts.force && !(await dueJobIds()).includes(id)) return { status: "not-due" };

      console.log(`[scheduled-jobs] starting ${id}`);
      await stamp(attemptKey(id));
      const started = Date.now();
      let ok = false;
      let error: string | undefined;
      try {
        ok = await JOB_RUNNERS[id](spec.args(process.env));
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        console.error(`[scheduled-jobs] ${id} threw:`, err);
      }
      const ms = Date.now() - started;
      if (ok) await stamp(successKey(id));
      console.log(`[scheduled-jobs] ${id} ${ok ? "succeeded" : "failed"} in ${ms} ms`);
      return { status: "ran", ok, ms, ...(error ? { error } : {}) };
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [JOBS_LOCK_ID]).catch(() => {
        discard = true;
      });
    }
  } finally {
    lockClient.release(discard);
  }
}
