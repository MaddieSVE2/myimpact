/**
 * Pending-approvals digest by hand. Normally run daily by the scheduler (see
 * SCHEDULING.md); the API server also checks on startup. The per-organisation
 * 7-day cooldown keeps managers from being emailed twice.
 */
import { JOB_RUNNERS } from "../jobs/index.js";
import { runCli } from "./_cli.js";

runCli("approval-digest", JOB_RUNNERS["approval-digest"]);
