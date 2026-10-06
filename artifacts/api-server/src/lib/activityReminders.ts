/**
 * Rules for the activity reminder emails (jobs/activityReminders.ts). No
 * database access, so they can be tested directly.
 */
import { dueOccurrence, startOfDayUTC, type DueStateInput } from "./recurringSchedule.js";

/** Reminders go out from this hour, UK time, on the day an activity is due. */
export const REMINDER_FROM_UK_HOUR = 7;

export function ukHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" })
    .formatToParts(now)
    .find((p) => p.type === "hour")?.value;
  return Number(hour);
}

export interface ReminderTemplate extends DueStateInput {
  lastRemindedOccurrence: Date | null;
}

/**
 * The occurrence to email about now, or null. Only an occurrence dated today
 * (a missed one is not chased the next day) that has not been emailed
 * about, confirmed or skipped.
 */
export function occurrenceToRemind(template: ReminderTemplate, now: Date): Date | null {
  const occurrence = dueOccurrence(template, now);
  if (!occurrence || occurrence.getTime() !== startOfDayUTC(now).getTime()) return null;
  const reminded = template.lastRemindedOccurrence;
  return reminded && reminded.getTime() >= occurrence.getTime() ? null : occurrence;
}

/**
 * Members with push set up and switched on get their reminders by push
 * only (its own per-type switches and pause apply), so nobody is reminded
 * twice. Everyone else gets the email.
 */
export function getsPushReminders(pushEnabled: boolean, subscriptionCount: number): boolean {
  return pushEnabled && subscriptionCount > 0;
}
