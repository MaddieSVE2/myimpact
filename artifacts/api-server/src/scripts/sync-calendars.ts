/** Calendar sync by hand (`--prune` also clears old events). Normally run hourly by the scheduler; see SCHEDULING.md. */
import { runCalendarSync } from "../jobs/calendarSync.js";
import { runCli } from "./_cli.js";

runCli("calendar-sync", runCalendarSync);
