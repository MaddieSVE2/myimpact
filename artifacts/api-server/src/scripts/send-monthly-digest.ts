/**
 * Monthly digest by hand, e.g. `--user-email <addr>` or `--dry-run` (all
 * flags are listed in src/jobs/monthlyDigest.ts). Normally run by the
 * scheduler; see SCHEDULING.md.
 */
import { runMonthlyDigest } from "../jobs/monthlyDigest.js";
import { runCli } from "./_cli.js";

runCli("monthly-digest", runMonthlyDigest);
