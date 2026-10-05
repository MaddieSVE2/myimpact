/**
 * Push reminders by hand, e.g. `--dry-run` or `--user-email <addr>`.
 * Normally run once a day by the scheduler; see SCHEDULING.md.
 */
import { runPushReminders } from "../jobs/pushReminders.js";
import { runCli } from "./_cli.js";

runCli("push-reminders", runPushReminders);
