/**
 * Hourly runner for every background job (see lib/scheduledJobs.ts).
 *
 * Run by one Replit Scheduled Deployment, every hour:
 *
 *   pnpm --filter @workspace/api-server run jobs:scheduled
 *
 * Each due job runs as its own child process, one after another, so one
 * failing job cannot stop the rest. When each job last started and last
 * succeeded is kept in ai_alert_state, and an advisory lock stops two runs
 * overlapping. Exits non-zero when any job failed, so Replit flags the run.
 *
 * Flags:
 *   --dry-run      List the jobs that are due without running them.
 *   --only <id>    Run one job now, whether or not it is due.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool, aiAlertStateTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { SCHEDULED_JOBS, isJobDue, type JobHistory, type JobSpec } from "../lib/scheduledJobs.js";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_PREFIX = "scheduled_job:";
// Arbitrary constant identifying this runner's advisory lock.
const RUNNER_LOCK_ID = 727_001;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

const attemptKey = (id: string) => `${STATE_PREFIX}${id}:attempt`;
const successKey = (id: string) => `${STATE_PREFIX}${id}:success`;

async function loadHistory(): Promise<Map<string, JobHistory>> {
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

/** Runs one job script with the same loader this runner was started with (tsx). */
function runJob(job: JobSpec): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [...process.execArgv, path.join(SCRIPTS_DIR, job.script), ...job.args(process.env)],
      { stdio: "inherit", env: process.env },
    );
    const timer = setTimeout(() => {
      console.error(`[scheduled-jobs] ${job.id} timed out after ${JOB_TIMEOUT_MS / 60000} minutes`);
      child.kill("SIGTERM");
    }, JOB_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      console.error(`[scheduled-jobs] ${job.id} could not start:`, err);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

function parseOnly(argv: string[]): string | undefined {
  const i = argv.indexOf("--only");
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const dryRun = argv.includes("--dry-run");
  const only = parseOnly(argv);
  if (only && !SCHEDULED_JOBS.some((j) => j.id === only)) {
    console.error(`[scheduled-jobs] unknown job "${only}". Jobs: ${SCHEDULED_JOBS.map((j) => j.id).join(", ")}`);
    return 1;
  }

  const lockClient = await pool.connect();
  try {
    const { rows } = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [
      RUNNER_LOCK_ID,
    ]);
    if (!rows[0]?.locked) {
      console.log("[scheduled-jobs] previous run still in progress, skipping this one");
      return 0;
    }

    const now = new Date();
    const history = await loadHistory();
    const due = SCHEDULED_JOBS.filter((j) => (only ? j.id === only : isJobDue(j.schedule, history.get(j.id)!, now)));
    console.log(`[scheduled-jobs] ${now.toISOString()}: due ${due.map((j) => j.id).join(", ") || "(none)"}`);
    if (dryRun) return 0;

    const failed: string[] = [];
    for (const job of due) {
      console.log(`[scheduled-jobs] starting ${job.id}`);
      await stamp(attemptKey(job.id));
      if (await runJob(job)) {
        await stamp(successKey(job.id));
        console.log(`[scheduled-jobs] ${job.id} succeeded`);
      } else {
        failed.push(job.id);
        console.error(`[scheduled-jobs] ${job.id} failed`);
      }
    }
    console.log(`[scheduled-jobs] done: ${due.length - failed.length} succeeded, ${failed.length} failed${failed.length ? ` (${failed.join(", ")})` : ""}`);
    return failed.length ? 1 : 0;
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RUNNER_LOCK_ID]).catch(() => {});
    lockClient.release();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error("[scheduled-jobs] runner failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
