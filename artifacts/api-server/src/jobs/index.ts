import { runApprovalDigestCheck } from "../lib/approvalDigest.js";
import { pruneEmailLog } from "../lib/emailLog.js";
import { runRetentionCleanup } from "../lib/retentionCleanup.js";
import type { ScheduledJobId } from "../lib/scheduledJobs.js";
import { runActivityReminders } from "./activityReminders.js";
import { runCalendarSync } from "./calendarSync.js";
import { runDatabaseBackup } from "./databaseBackup.js";
import { runMonthlyDigest } from "./monthlyDigest.js";
import { runOnboardingEmails } from "./onboardingEmails.js";
import { runPushReminders } from "./pushReminders.js";

/**
 * The function behind each scheduled job. Each takes the job's CLI-style
 * flags and resolves to false (or throws) when the run failed. None of them
 * closes the database pool, so they can run inside the API server.
 */
export const JOB_RUNNERS: Record<ScheduledJobId, (args: string[]) => Promise<boolean>> = {
  "onboarding-emails": () => runOnboardingEmails(),
  "calendar-sync": runCalendarSync,
  // Logs and swallows its own per-organisation errors.
  "approval-digest": async () => {
    await runApprovalDigestCheck();
    return true;
  },
  "push-reminders": runPushReminders,
  "monthly-digest": runMonthlyDigest,
  "database-backup": runDatabaseBackup,
  "activity-reminders": runActivityReminders,
  "retention-cleanup": async () => {
    await runRetentionCleanup();
    console.log(`[retention-cleanup] deleted ${await pruneEmailLog()} email log entries older than a year`);
    return true;
  },
};
