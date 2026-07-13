/**
 * Onboarding email dispatcher.
 *
 * Designed to run once per day on a scheduled deployment.
 *
 * On each run we look for users who reached the Day 1, Day 7 or Day 30 marker
 * since signup, who:
 *   - signed up via magic link (have at least one confirmed magic_token)
 *   - still have email_opt_in = true on their user_profile
 *   - have not already received that step (onboarding_email_sends row absent)
 *   - are not a demo / persona account
 *
 * For each eligible user we build the appropriate email payload, send it via
 * Resend, then INSERT into onboarding_email_sends. The unique (user_id, step)
 * index makes the whole run idempotent: re-running the same day cannot
 * double-send the same email even if a previous run partially succeeded.
 */
import {
  db,
  pool,
  usersTable,
  userProfilesTable,
  magicTokensTable,
  impactRecordsTable,
  onboardingEmailSendsTable,
} from "@workspace/db";
import { and, eq, gte, lte, isNull, or, sql } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend.js";
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
  type OnboardingActivity,
  buildDay1Email,
  buildDay7ActiveEmail,
  buildDay7GentleEmail,
  buildDay30Email,
  sendOnboardingEmail,
} from "../lib/onboardingEmails.js";
import { ACTIVITIES } from "../lib/impactData.js";

// Emails we never enrol in the sequence — demo personas used in screenshots
// and the like. Mirror of PERSONA_ACCOUNTS in routes/auth.ts plus the seeded
// demo user.
const PERSONA_EMAILS = new Set<string>([
  "demo@demo.org",
  "volunteer@volunteer.org",
  "student@student.org",
  "carer@carer.org",
  "veteran@veteran.org",
  "apprentice@apprentice.org",
  "jobseeker@jobseeker.org",
  "organisation@organisation.org",
  "university@university.org",
]);

// Synthetic seeded accounts (never real inboxes) are excluded by pattern.
function isSyntheticSeedEmail(email: string): boolean {
  const e = email.toLowerCase();
  return (
    e.startsWith("synth-member-") ||
    e.startsWith("uni-synth-") ||
    e.endsWith("@demo-organisation.org") ||
    e.endsWith("@myimpact-university.org")
  );
}

const ACTIVITY_BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]));

interface EligibleUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
}

function getAppUrl(): string {
  const appUrl =
    process.env.APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  if (!appUrl) {
    throw new Error("APP_URL (or REPLIT_DEV_DOMAIN) must be set so emails contain working links.");
  }
  return appUrl.replace(/\/$/, "");
}

/**
 * Find users whose signup date falls in the Day-N window (i.e. they crossed
 * the N-day mark in the last 24 hours), are opted in, signed up via magic
 * link, are not a demo account, and have no existing send for this step.
 */
async function findEligibleUsersForStep(step: OnboardingStep, now: Date): Promise<EligibleUser[]> {
  // The window is the 24h preceding `now - step days`. A user signed up
  // exactly N days ago lands inside this window. Slightly wider tolerance
  // (24h) gives us a safe margin if a daily run is briefly delayed.
  const windowEnd = new Date(now.getTime() - step * 24 * 60 * 60 * 1000);
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  // LEFT JOIN user_profiles: a user who signed up via magic link but has not
  // yet visited /settings or completed the onboarding wizard has no profile
  // row at all. Those users are exactly the ones we most want to nudge, so
  // treat "no profile row" as opted-in (which matches the column default).
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(userProfilesTable, eq(userProfilesTable.userId, usersTable.id))
    .leftJoin(
      onboardingEmailSendsTable,
      and(
        eq(onboardingEmailSendsTable.userId, usersTable.id),
        eq(onboardingEmailSendsTable.step, step)
      )
    )
    .where(
      and(
        gte(usersTable.createdAt, windowStart),
        lte(usersTable.createdAt, windowEnd),
        // GDPR: only send onboarding emails to users with an explicit opt-in
        // recorded on user_profiles. Missing profile rows are treated as
        // opted-OUT (no implicit consent).
        eq(userProfilesTable.emailOptIn, true),
        isNull(onboardingEmailSendsTable.id),
        // Must have at least one confirmed magic token (i.e. a real magic-link sign-in).
        sql`EXISTS (SELECT 1 FROM ${magicTokensTable} mt WHERE mt.user_id = ${usersTable.id} AND mt.confirmed = true)`
      )
    );

  return rows.filter(
    (r) => !PERSONA_EMAILS.has(r.email.toLowerCase()) && !isSyntheticSeedEmail(r.email)
  );
}

async function loadActivitySummary(userId: string): Promise<OnboardingActivity> {
  const records = await db
    .select()
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId));

  let totalHours = 0;
  let totalValue = 0;
  const categoryHours = new Map<string, number>();

  for (const r of records) {
    totalHours += r.totalHours;
    totalValue += Number(r.totalValue);

    const activitiesJson = r.activitiesJson as Array<{ id?: string; hours?: number }> | null;
    if (Array.isArray(activitiesJson)) {
      for (const a of activitiesJson) {
        if (!a?.id) continue;
        const def = ACTIVITY_BY_ID.get(a.id);
        if (!def) continue;
        const hrs = typeof a.hours === "number" ? a.hours : 0;
        categoryHours.set(def.category, (categoryHours.get(def.category) ?? 0) + hrs);
      }
    }
  }

  let topCategoryLabel: string | null = null;
  let topHours = 0;
  for (const [cat, hrs] of categoryHours) {
    if (hrs > topHours) {
      topHours = hrs;
      topCategoryLabel = cat;
    }
  }

  return {
    totalHours,
    totalValue,
    recordCount: records.length,
    topCategoryLabel,
  };
}

interface StepResult {
  step: OnboardingStep;
  attempted: number;
  sent: number;
  skipped: number;
  errors: Array<{ userId: string; email: string; error: string }>;
}

async function processStep(step: OnboardingStep, now: Date): Promise<StepResult> {
  const result: StepResult = { step, attempted: 0, sent: 0, skipped: 0, errors: [] };
  const users = await findEligibleUsersForStep(step, now);
  result.attempted = users.length;

  if (users.length === 0) return result;

  const { client, fromEmail } = await getUncachableResendClient();
  const appUrl = getAppUrl();

  for (const user of users) {
    try {
      const ctx = { email: user.email, displayName: user.displayName, appUrl };

      let payload: { subject: string; html: string };
      if (step === 1) {
        payload = buildDay1Email(ctx);
      } else if (step === 7) {
        const activity = await loadActivitySummary(user.id);
        payload =
          activity.recordCount > 0
            ? buildDay7ActiveEmail(ctx, activity)
            : buildDay7GentleEmail(ctx);
      } else {
        const activity = await loadActivitySummary(user.id);
        payload = buildDay30Email(ctx, activity);
      }

      // Belt-and-braces: claim the (user, step) slot first. If two dispatcher
      // runs race, one will fail the unique-index insert and skip the send.
      const inserted = await db
        .insert(onboardingEmailSendsTable)
        .values({ userId: user.id, step })
        .onConflictDoNothing()
        .returning({ id: onboardingEmailSendsTable.id });

      if (inserted.length === 0) {
        result.skipped += 1;
        continue;
      }

      try {
        await sendOnboardingEmail(client, fromEmail, user.email, payload.subject, payload.html);
        result.sent += 1;
      } catch (sendErr) {
        // Roll back the claim so a later run can retry.
        await db
          .delete(onboardingEmailSendsTable)
          .where(
            and(
              eq(onboardingEmailSendsTable.userId, user.id),
              eq(onboardingEmailSendsTable.step, step)
            )
          );
        throw sendErr;
      }
    } catch (err) {
      result.errors.push({
        userId: user.id,
        email: user.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

async function main() {
  const now = new Date();
  console.log(`[onboarding-emails] Running at ${now.toISOString()}`);

  const results: StepResult[] = [];
  for (const step of ONBOARDING_STEPS) {
    try {
      const r = await processStep(step, now);
      results.push(r);
      console.log(
        `[onboarding-emails] step=${step} attempted=${r.attempted} sent=${r.sent} skipped=${r.skipped} errors=${r.errors.length}`
      );
      for (const e of r.errors) {
        console.error(`[onboarding-emails]   error user=${e.userId} email=${e.email}: ${e.error}`);
      }
    } catch (err) {
      console.error(`[onboarding-emails] step=${step} fatal:`, err);
    }
  }

  const totalErrors = results.reduce((acc, r) => acc + r.errors.length, 0);
  const totalSent = results.reduce((acc, r) => acc + r.sent, 0);
  console.log(`[onboarding-emails] Done. total_sent=${totalSent} total_errors=${totalErrors}`);

  await pool.end();

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[onboarding-emails] Unhandled error:", err);
  pool.end().finally(() => process.exit(1));
});
