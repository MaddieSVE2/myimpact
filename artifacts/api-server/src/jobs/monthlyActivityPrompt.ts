/**
 * The monthly "anything to add?" email, run by the scheduler on the last
 * day of each month (see SCHEDULING.md). It asks members whether they have done
 * anything this month that is not on their record yet. Who gets it is in
 * lib/monthlyPrompt.ts and the email in lib/monthlyPromptEmail.ts.
 *
 * It sends nothing until EMAIL_MONTHLY_PROMPT_LIVE is "true" (everyone
 * eligible) or EMAIL_MONTHLY_PROMPT_TEST_TO lists accounts to try it on.
 *
 * Each member is claimed (users.last_activity_prompt_sent_at) before
 * sending, so a retry after a partial failure, or two runs at once, never
 * emails anyone twice in a month. Test runs claim nothing, so they can be
 * repeated.
 *
 * Flags:
 *   --dry-run   Log who would be emailed without claiming or sending.
 */
import { db, usersTable, emailSuppressionsTable } from "@workspace/db";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend.js";
import { isDemoOrSyntheticEmail } from "../lib/demoAccounts.js";
import { activityInboxAddress, activityInboxLive } from "../lib/emailActivity.js";
import { decidePrompt, monthlyPromptSettings } from "../lib/monthlyPrompt.js";
import { buildMonthlyPromptEmail, promptMonth } from "../lib/monthlyPromptEmail.js";
import { buildOneClickUnsubscribeUrl, buildUnsubscribeUrl } from "../lib/unsubscribeToken.js";

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

function getAppUrl(): string {
  const appUrl =
    process.env.APP_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  if (!appUrl) throw new Error("APP_URL (or REPLIT_DEV_DOMAIN) must be set so emails contain working links.");
  return appUrl.replace(/\/$/, "");
}

export async function runMonthlyActivityPrompt(args: string[]): Promise<boolean> {
  const dryRun = args.includes("--dry-run");
  const settings = monthlyPromptSettings();
  if (!settings.live && settings.testTo.length === 0) {
    console.log("[monthly-activity-prompt] switched off: set EMAIL_MONTHLY_PROMPT_LIVE=true, or EMAIL_MONTHLY_PROMPT_TEST_TO to try it");
    return true;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      optIn: usersTable.emailActivityPromptOptIn,
      createdAt: usersTable.createdAt,
      lastSentAt: usersTable.lastActivityPromptSentAt,
      locale: usersTable.preferredLocale,
    })
    .from(usersTable)
    .where(settings.live ? eq(usersTable.emailActivityPromptOptIn, true) : inArray(usersTable.email, settings.testTo));
  const suppressed = new Set(
    users.length === 0
      ? []
      : (
          await db
            .select({ email: emailSuppressionsTable.email })
            .from(emailSuppressionsTable)
            .where(inArray(emailSuppressionsTable.email, users.map((u) => u.email.toLowerCase())))
        ).map((r) => r.email),
  );

  const recipients = users.filter(
    (u) =>
      decidePrompt(u, {
        settings,
        now,
        monthStart,
        isSuppressed: (email) => suppressed.has(email),
        isDemo: isDemoOrSyntheticEmail,
      }).send,
  );
  const mode = settings.live ? "live" : "test";
  console.log(`[monthly-activity-prompt] ${mode} run: ${recipients.length} of ${users.length} account(s) to email`);
  if (recipients.length === 0) return true;

  const appUrl = getAppUrl();
  // A reply is only invited when the activity inbox reads members' emails.
  const inbox = activityInboxLive() ? activityInboxAddress() : null;
  const { client, fromEmail } = await getUncachableResendClient("monthly-prompt");
  let sent = 0;
  let errors = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    await Promise.all(
      recipients.slice(i, i + BATCH_SIZE).map(async (user) => {
        if (dryRun) {
          console.log(`[monthly-activity-prompt] [dry-run] ${user.email}`);
          return;
        }
        // Claim this month for them; a concurrent or repeated run claims
        // nothing and sends nothing.
        if (settings.live) {
          const claimed = await db
            .update(usersTable)
            .set({ lastActivityPromptSentAt: now })
            .where(
              and(
                eq(usersTable.id, user.id),
                or(isNull(usersTable.lastActivityPromptSentAt), lt(usersTable.lastActivityPromptSentAt, monthStart)),
              ),
            )
            .returning({ id: usersTable.id });
          if (claimed.length === 0) return;
        }
        try {
          const locale = user.locale === "cy" ? "cy" : "en";
          const email = buildMonthlyPromptEmail({
            displayName: user.displayName,
            appUrl,
            locale,
            month: promptMonth(now, locale),
            canReply: !!inbox,
            unsubscribeUrl: buildUnsubscribeUrl(appUrl, user.id, "monthly-prompt"),
          });
          const oneClick = buildOneClickUnsubscribeUrl(appUrl, user.id, "monthly-prompt");
          const { error } = await client.emails.send({
            from: fromEmail,
            to: user.email,
            // A reply goes to the activity inbox, which reads and logs it.
            ...(inbox ? { replyTo: inbox } : {}),
            ...email,
            headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          });
          if (error) throw new Error(error.message);
          sent++;
        } catch (err) {
          errors++;
          console.error(`[monthly-activity-prompt] ${user.id}: send failed, releasing the claim:`, err);
          // Give the month back so the next run tries again.
          if (settings.live) {
            await db.update(usersTable).set({ lastActivityPromptSentAt: user.lastSentAt }).where(eq(usersTable.id, user.id));
          }
        }
      }),
    );
  }

  console.log(`[monthly-activity-prompt] done (${mode}): ${sent} sent, ${errors} failed`);
  return errors === 0;
}
