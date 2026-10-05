/**
 * Pending-approvals digest, run once a day by scripts/run-scheduled-jobs.ts.
 *
 * The API server also runs this check on startup (lib/approvalDigest.ts),
 * but an autoscale deployment sleeps when idle, so the server alone cannot
 * be relied on to run it daily. The per-organisation 7-day cooldown keeps
 * the two from emailing managers twice.
 */
import { pool } from "@workspace/db";
import { runApprovalDigestCheck } from "../lib/approvalDigest.js";

runApprovalDigestCheck()
  .catch((err) => {
    console.error("Approval digest failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
