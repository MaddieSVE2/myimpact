import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { isScheduledJobId, type ScheduledJobId } from "../lib/scheduledJobs.js";
import { dueJobIds, runScheduledJob } from "../jobs/runner.js";

/**
 * Triggers for the scheduled jobs (see SCHEDULING.md). Every job runs inside
 * the request that triggers it, so nothing depends on the autoscale instance
 * staying awake after it responds.
 *
 * - `run-due`: called hourly by cron-job.org. Runs every due job in turn.
 * - `due` + `run/:id`: the GitHub Actions workflow (a backup trigger, and
 *   manual runs, which may force a job that is not due).
 */
const router: IRouter = Router();

// Shorter tokens are treated as not configured, so a weak secret fails closed.
const MIN_TOKEN_LENGTH = 32;

/**
 * `run-due` stops starting new jobs after this long, so it answers before
 * cron-job.org gives up on the request (30 seconds). Jobs it did not start
 * stay due and run on the next call.
 */
export const RUN_DUE_BUDGET_MS = 20_000;

/** Accepts a bearer token matching any of the named secrets that is set and long enough. */
function requireToken(secretNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const accepted = secretNames
      .map((name) => process.env[name] ?? "")
      .filter((token) => token.length >= MIN_TOKEN_LENGTH)
      .map((token) => Buffer.from(token));
    if (accepted.length === 0) {
      res.status(503).json({ error: "Scheduled jobs are not configured" });
      return;
    }
    const header = req.get("authorization") ?? "";
    const given = Buffer.from(header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "");
    if (!accepted.some((wanted) => given.length === wanted.length && timingSafeEqual(given, wanted))) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

/** The full token: may list jobs and force one to run. */
export const requireScheduledJobsToken = requireToken(["SCHEDULED_JOBS_TOKEN"]);

/**
 * `run-due` also takes SCHEDULED_JOBS_CRON_TOKEN, held by cron-job.org. That
 * token can only run what is due, so whoever holds it cannot force a job
 * (say, every member's push reminders again).
 */
const requireRunDueToken = requireToken(["SCHEDULED_JOBS_TOKEN", "SCHEDULED_JOBS_CRON_TOKEN"]);

router.post("/internal/scheduled-jobs/due", requireScheduledJobsToken, async (_req, res) => {
  res.json({ due: await dueJobIds() });
});

router.post("/internal/scheduled-jobs/run/:id", requireScheduledJobsToken, async (req, res) => {
  const id = String(req.params.id);
  if (!isScheduledJobId(id)) {
    res.status(404).json({ error: `Unknown job "${id}"` });
    return;
  }
  const result = await runScheduledJob(id, { force: req.query.force === "1" });
  const status = result.status === "busy" ? 409 : result.status === "ran" && !result.ok ? 500 : 200;
  res.status(status).json({ id, ...result });
});

type RunDueEntry =
  | { id: ScheduledJobId; status: "ran"; ok: boolean; ms: number }
  | { id: ScheduledJobId; status: "not-due" | "busy" | "deferred" };

/**
 * Runs the due jobs one after another and answers with each outcome. A
 * failed job makes it a 500, so cron-job.org reports the failure. Error
 * messages stay in the deployment logs: cron-job.org keeps response bodies.
 */
async function runDue(_req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const jobs: RunDueEntry[] = [];
  for (const id of await dueJobIds()) {
    if (Date.now() - started >= RUN_DUE_BUDGET_MS) {
      jobs.push({ id, status: "deferred" });
      continue;
    }
    const result = await runScheduledJob(id);
    jobs.push(result.status === "ran" ? { id, status: "ran", ok: result.ok, ms: result.ms } : { id, status: result.status });
  }
  const failed = jobs.filter((j) => j.status === "ran" && !j.ok).map((j) => j.id);
  res.status(failed.length > 0 ? 500 : 200).json({ ok: failed.length === 0, failed, jobs });
}

// GET too, in case a cron service sends a POST without a body (which the
// hosting front end rejects with 411).
router.post("/internal/scheduled-jobs/run-due", requireRunDueToken, runDue);
router.get("/internal/scheduled-jobs/run-due", requireRunDueToken, runDue);

export default router;
