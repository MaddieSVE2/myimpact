import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { isScheduledJobId } from "../lib/scheduledJobs.js";
import { dueJobIds, runScheduledJob } from "../jobs/runner.js";

/**
 * Hourly trigger for the scheduled jobs, called by
 * .github/workflows/scheduled-jobs.yml (see SCHEDULING.md). Each request
 * runs at most one job, inside the request, so nothing depends on the
 * autoscale instance staying awake after it responds.
 */
const router: IRouter = Router();

// Shorter tokens are treated as not configured, so a weak secret fails closed.
const MIN_TOKEN_LENGTH = 32;

export function requireScheduledJobsToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.SCHEDULED_JOBS_TOKEN ?? "";
  if (expected.length < MIN_TOKEN_LENGTH) {
    res.status(503).json({ error: "Scheduled jobs are not configured" });
    return;
  }
  const header = req.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "");
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

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

export default router;
