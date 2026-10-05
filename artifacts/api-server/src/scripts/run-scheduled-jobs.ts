/**
 * Runs the scheduled jobs by hand, the same way the hourly GitHub Actions
 * trigger does through the API (see SCHEDULING.md):
 *
 *   pnpm --filter @workspace/api-server run jobs:scheduled
 *
 * Flags:
 *   --dry-run      List the jobs that are due without running them.
 *   --only <id>    Run one job now, whether or not it is due.
 */
import { SCHEDULED_JOB_IDS, isScheduledJobId } from "../lib/scheduledJobs.js";
import { dueJobIds, runScheduledJob } from "../jobs/runner.js";
import { runCli } from "./_cli.js";

runCli("scheduled-jobs", async (args) => {
  const argv = args.filter((a) => a !== "--");
  const onlyIndex = argv.indexOf("--only");
  const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : undefined;
  if (only !== undefined && !isScheduledJobId(only)) {
    console.error(`[scheduled-jobs] unknown job "${only}". Jobs: ${SCHEDULED_JOB_IDS.join(", ")}`);
    return false;
  }

  const ids = only ? [only] : await dueJobIds();
  console.log(`[scheduled-jobs] ${new Date().toISOString()}: due ${ids.join(", ") || "(none)"}`);
  if (argv.includes("--dry-run")) return true;

  let failed = 0;
  for (const id of ids) {
    const result = await runScheduledJob(id, { force: only !== undefined });
    if (result.status === "busy") console.log(`[scheduled-jobs] ${id} skipped: another job is running`);
    if (result.status === "ran" && !result.ok) failed++;
  }
  return failed === 0;
});
