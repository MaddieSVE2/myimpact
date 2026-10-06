/**
 * Email reminders for regular activities, run on every hourly scheduler
 * pass (see SCHEDULING.md). From 07:00 UK time on the day an activity is
 * due, each member gets one email listing what is due that day. Each
 * occurrence is claimed (recurring_templates.last_reminded_occurrence)
 * before sending, so it is emailed at most once however often this runs.
 *
 * Skipped: members who switched reminder emails off, members with push set
 * up (push handles their reminders), demo accounts and suppressed addresses.
 *
 * Flags:
 *   --dry-run   Log who would be emailed without claiming or sending.
 */
import {
  db,
  usersTable,
  recurringTemplatesTable,
  pushSubscriptionsTable,
  emailSuppressionsTable,
  type RecurringTemplate,
} from "@workspace/db";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend.js";
import { getEffectivePreferences } from "../lib/push.js";
import { buildActivityReminderEmail } from "../lib/activityReminderEmail.js";
import { getsPushReminders, occurrenceToRemind, REMINDER_FROM_UK_HOUR, ukHour } from "../lib/activityReminders.js";
import { startOfDayUTC } from "../lib/recurringSchedule.js";
import { buildOneClickUnsubscribeUrl, buildUnsubscribeUrl } from "../lib/unsubscribeToken.js";
import { isDemoOrSyntheticEmail } from "./onboardingEmails.js";

function getAppUrl(): string {
  const appUrl =
    process.env.APP_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  if (!appUrl) throw new Error("APP_URL (or REPLIT_DEV_DOMAIN) must be set so emails contain working links.");
  return appUrl.replace(/\/$/, "");
}

export async function runActivityReminders(args: string[]): Promise<boolean> {
  const dryRun = args.includes("--dry-run");
  const now = new Date();
  if (ukHour(now) < REMINDER_FROM_UK_HOUR) {
    console.log(`[activity-reminders] before ${REMINDER_FROM_UK_HOUR}:00 UK time, nothing to send yet`);
    return true;
  }
  const today = startOfDayUTC(now);

  const dueByUser = new Map<string, RecurringTemplate[]>();
  for (const t of await db.select().from(recurringTemplatesTable)) {
    if (!occurrenceToRemind(t, now)) continue;
    dueByUser.set(t.userId, [...(dueByUser.get(t.userId) ?? []), t]);
  }
  if (dueByUser.size === 0) {
    console.log("[activity-reminders] no regular activities due today");
    return true;
  }

  const userIds = [...dueByUser.keys()];
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      optIn: usersTable.emailRemindersOptIn,
      locale: usersTable.preferredLocale,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  const suppressed = new Set(
    (
      await db
        .select({ email: emailSuppressionsTable.email })
        .from(emailSuppressionsTable)
        .where(inArray(emailSuppressionsTable.email, users.map((u) => u.email.toLowerCase())))
    ).map((r) => r.email),
  );
  const subscriptions = new Map(
    (
      await db
        .select({ userId: pushSubscriptionsTable.userId, n: sql<number>`count(*)::int` })
        .from(pushSubscriptionsTable)
        .where(inArray(pushSubscriptionsTable.userId, userIds))
        .groupBy(pushSubscriptionsTable.userId)
    ).map((r) => [r.userId, r.n]),
  );

  const appUrl = getAppUrl();
  const { client, fromEmail } = await getUncachableResendClient("activity-reminder");
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    const templates = dueByUser.get(user.id)!;
    const subscriptionCount = subscriptions.get(user.id) ?? 0;
    const pushEnabled = subscriptionCount > 0 && (await getEffectivePreferences(user.id)).enabled;
    if (
      !user.optIn ||
      isDemoOrSyntheticEmail(user.email) ||
      suppressed.has(user.email.toLowerCase()) ||
      getsPushReminders(pushEnabled, subscriptionCount)
    ) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[activity-reminders] [dry-run] ${user.email}: ${templates.map((t) => t.label).join(", ")}`);
      continue;
    }

    // Claim today's occurrence for these templates; a concurrent or repeated
    // run claims nothing and sends nothing.
    const claimed = await db
      .update(recurringTemplatesTable)
      .set({ lastRemindedOccurrence: today })
      .where(
        and(
          inArray(recurringTemplatesTable.id, templates.map((t) => t.id)),
          or(
            isNull(recurringTemplatesTable.lastRemindedOccurrence),
            lt(recurringTemplatesTable.lastRemindedOccurrence, today),
          ),
        ),
      )
      .returning({ id: recurringTemplatesTable.id });
    const claimedIds = new Set(claimed.map((c) => c.id));
    const toSend = templates.filter((t) => claimedIds.has(t.id));
    if (toSend.length === 0) continue;

    try {
      const email = buildActivityReminderEmail(
        {
          displayName: user.displayName,
          appUrl,
          locale: user.locale === "cy" ? "cy" : "en",
          unsubscribeUrl: buildUnsubscribeUrl(appUrl, user.id, "activity-reminders"),
        },
        toSend.map((t) => ({ label: t.label, cadence: t.cadence })),
      );
      const oneClick = buildOneClickUnsubscribeUrl(appUrl, user.id, "activity-reminders");
      const { error } = await client.emails.send({
        from: fromEmail,
        to: user.email,
        ...email,
        headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      if (error) throw new Error(error.message);
      sent++;
    } catch (err) {
      errors++;
      console.error(`[activity-reminders] ${user.id}: send failed, releasing the claim:`, err);
      // Give the occurrence back so the next run tries again.
      for (const t of toSend) {
        await db
          .update(recurringTemplatesTable)
          .set({ lastRemindedOccurrence: t.lastRemindedOccurrence })
          .where(eq(recurringTemplatesTable.id, t.id));
      }
    }
  }

  console.log(`[activity-reminders] done: ${sent} sent, ${skipped} skipped, ${errors} failed`);
  return errors === 0;
}
