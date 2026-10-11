import express, { Router, type IRouter } from "express";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { readCspReports } from "../lib/cspReport.js";

/**
 * Where browsers send Content-Security-Policy reports while the web app's
 * policy is report-only. Each is logged as one line, so the Replit logs show
 * what the policy would block before it is switched on.
 */
const router: IRouter = Router();

const cspReportRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many reports.",
});

router.post(
  "/csp-report",
  cspReportRateLimit,
  express.json({ type: ["application/csp-report", "application/reports+json", "application/json"], limit: "16kb" }),
  (req, res) => {
    for (const v of readCspReports(req.body)) {
      console.warn(`[csp] ${v.directive || "unknown"} would block ${v.blocked || "(nothing)"} on ${v.page || "(unknown page)"}`);
    }
    res.status(204).end();
  },
);

export default router;
