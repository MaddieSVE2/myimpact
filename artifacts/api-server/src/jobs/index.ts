import { runApprovalDigestCheck } from "../lib/approvalDigest.js";
import type { ScheduledJobId } from "../lib/scheduledJobs.js";
import { runCalendarSync } from "./calendarSync.js";
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
};
