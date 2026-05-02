/**
 * Monthly digest dispatcher.
 *
 * Iterates every user with `email_digest_opt_in = true` who has at
 * least one impact record, builds a per-user payload for the previous
 * calendar month, and sends a personalised recap via Resend.
 *
 * Designed to run as a Replit Scheduled Deployment on the 1st of each
 * month. Safe to re-run inside the same calendar month — `--once`
 * mode (default) will resend if invoked again, while `--skip-recently-sent`
 * will deduplicate against `users.last_digest_sent_at`.
 *
 * Flags:
 *   --skip-recently-sent     Skip users whose lastDigestSentAt falls
 *                             inside the current digest's target month.
 *                             Recommended for the scheduled run.
 *   --notify                  Email a summary to BACKUP_NOTIFY_EMAIL
 *                             (or --notify-email) on success and on
 *                             top-level failure.
 *   --notify-email <addr>     Override the notify recipient.
 *   --dry-run                 Build payloads and log results without
 *                             calling Resend or updating users.
 *   --batch-size <n>          Number of emails per Resend batch (default 25).
 *   --batch-delay-ms <n>      Delay between batches (default 1000ms).
 *   --user-email <addr>       Send to a single user only — useful for
 *                             test runs.
 */
import { db, usersTable, impactRecordsTable, pool } from "@workspace/db";
import { eq, and, gte, lt, sql, inArray, isNotNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getUncachableResendClient } from "../lib/resend.js";
import {
  buildMonthlyDigest,
  previousMonthRange,
  type MonthlyDigestPayload,
} from "../lib/digestData.js";
import {
  buildDigestEmail,
  buildDigestSubject,
  buildDigestPlainText,
} from "../lib/digestEmail.js";

interface Options {
  skipRecentlySent: boolean;
  dryRun: boolean;
  notify: boolean;
  notifyEmail?: string;
  batchSize: number;
  batchDelayMs: number;
  singleUserEmail?: string;
}

interface SendResult {
  userId: string;
  email: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  monthLabel?: string;
}

function getAppUrl(): string {
  const appUrl =
    process.env.APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  if (!appUrl) {
    throw new Error(
      "APP_URL is not set. Configure APP_URL on the production environment so " +
        "the digest's CTA and unsubscribe link point to the live site.",
    );
  }
  return appUrl.replace(/\/$/, "");
}

function parseStringArg(args: string[], name: string): string | undefined {
  const idx = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx === -1) return undefined;
  if (args[idx]!.includes("=")) return args[idx]!.split("=").slice(1).join("=");
  return args[idx + 1];
}

function parseIntArg(args: string[], name: string, fallback: number): number {
  const raw = parseStringArg(args, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} expects a non-negative integer, got "${raw}".`);
  }
  return n;
}

async function ensureUnsubscribeToken(userId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = randomBytes(24).toString("hex");
  const [updated] = await db
    .update(usersTable)
    .set({ unsubscribeToken: token })
    .where(eq(usersTable.id, userId))
    .returning({ unsubscribeToken: usersTable.unsubscribeToken });
  return updated?.unsubscribeToken ?? token;
}

/**
 * Fire-and-retry-once helper around Resend.emails.send to absorb transient
 * 5xx / network blips without aborting the whole batch.
 */
async function sendWithRetry(
  client: Awaited<ReturnType<typeof getUncachableResendClient>>["client"],
  fromEmail: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { error } = await client.emails.send({
        from: fromEmail,
        to,
        subject,
        html,
        text,
      });
      if (!error) return { ok: true };
      const msg = typeof error === "string" ? error : JSON.stringify(error);
      if (attempt === 2) return { ok: false, error: msg };
      await sleep(800);
    } catch (err) {
      if (attempt === 2) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      await sleep(800);
    }
  }
  return { ok: false, error: "exhausted retries" };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadEligibleUsers(opts: Options, monthStart: Date) {
  // Distinct user IDs with at least one impact record. Built as a subquery
  // so we don't materialise every record.
  const userIdsWithRecords = db
    .selectDistinct({ userId: impactRecordsTable.userId })
    .from(impactRecordsTable);

  let rows = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.emailDigestOptIn, true),
        inArray(usersTable.id, userIdsWithRecords),
      ),
    );

  if (opts.singleUserEmail) {
    const target = opts.singleUserEmail.trim().toLowerCase();
    rows = rows.filter((u) => u.email.toLowerCase() === target);
  }

  if (opts.skipRecentlySent) {
    rows = rows.filter(
      (u) => !u.lastDigestSentAt || u.lastDigestSentAt < monthStart,
    );
  }
  return rows;
}

function summariseResults(results: SendResult[]): {
  sent: number;
  skipped: number;
  failed: number;
} {
  const sent = results.filter((r) => r.status === "sent").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  return { sent, skipped, failed };
}

async function dispatchDigests(opts: Options) {
  const appUrl = getAppUrl();
  const { start, end, monthLabel } = previousMonthRange();

  console.log(`\n[1/3] Loading eligible users for digest covering ${monthLabel}...`);
  const users = await loadEligibleUsers(opts, end);
  console.log(`      ${users.length} candidate user(s).`);

  if (users.length === 0) {
    return { results: [] as SendResult[], monthLabel };
  }

  console.log(`\n[2/3] Building per-user payloads...`);
  const prepared: Array<{
    user: typeof users[number];
    payload: MonthlyDigestPayload;
  }> = [];
  for (const u of users) {
    try {
      const payload = await buildMonthlyDigest(u.id, start, end, monthLabel);
      prepared.push({ user: u, payload });
    } catch (err) {
      console.error(`      ! Failed to build payload for ${u.email}: ${(err as Error).message}`);
      prepared.push({
        user: u,
        payload: {
          monthLabel,
          hasActivityThisMonth: false,
          totals: {
            totalValue: 0,
            impactValue: 0,
            contributionValue: 0,
            donationsValue: 0,
            personalDevelopmentValue: 0,
            totalHours: 0,
            recordCount: 0,
          },
          topActivity: null,
          topSdg: null,
          newMilestones: [],
          journalHighlight: null,
          cumulative: { totalValue: 0, totalHours: 0, recordCount: 0 },
        } satisfies MonthlyDigestPayload,
      });
    }
  }

  // The acceptance criterion says new users only get their first digest
  // *after* they have at least one logged session. We enforce that here
  // by skipping anyone with no activity in the target month — a brand-new
  // signup with no records at all was already filtered above, but a user
  // who logged in but didn't log anything last month should also be
  // skipped this cycle so we don't spam an empty recap.
  const dispatchable = prepared.filter((p) => p.payload.hasActivityThisMonth);
  const skippedNoActivity = prepared.length - dispatchable.length;
  console.log(
    `      ${dispatchable.length} user(s) have activity in ${monthLabel}; ${skippedNoActivity} skipped (no activity).`,
  );

  console.log(`\n[3/3] Sending digests in batches of ${opts.batchSize}${opts.dryRun ? " (DRY RUN)" : ""}...`);

  const results: SendResult[] = [];
  // Pre-record skipped-no-activity users so the summary reflects the full set.
  for (const { user } of prepared.filter((p) => !p.payload.hasActivityThisMonth)) {
    results.push({
      userId: user.id,
      email: user.email,
      status: "skipped",
      reason: "no activity in target month",
      monthLabel,
    });
  }

  if (dispatchable.length === 0) {
    return { results, monthLabel };
  }

  const { client, fromEmail } = await getUncachableResendClient();

  for (let i = 0; i < dispatchable.length; i += opts.batchSize) {
    const batch = dispatchable.slice(i, i + opts.batchSize);
    const batchNum = Math.floor(i / opts.batchSize) + 1;
    console.log(`      Batch ${batchNum}: ${batch.length} email(s)`);

    await Promise.all(
      batch.map(async ({ user, payload }) => {
        try {
          const unsubscribeToken = await ensureUnsubscribeToken(user.id, user.unsubscribeToken);
          const unsubscribeUrl = `${appUrl}/api/auth/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
          const greetingName = (user.displayName?.trim() || user.email.split("@")[0] || "there").trim();

          const html = buildDigestEmail({
            payload,
            appUrl,
            unsubscribeUrl,
            greetingName,
          });
          const text = buildDigestPlainText({
            payload,
            appUrl,
            unsubscribeUrl,
            greetingName,
          });
          const subject = buildDigestSubject(payload);

          if (opts.dryRun) {
            console.log(`      [dry-run] would send to ${user.email} — ${subject}`);
            results.push({ userId: user.id, email: user.email, status: "sent", monthLabel });
            return;
          }

          const send = await sendWithRetry(client, fromEmail, user.email, subject, html, text);
          if (!send.ok) {
            console.error(`      ✗ ${user.email}: ${send.error}`);
            results.push({
              userId: user.id,
              email: user.email,
              status: "failed",
              reason: send.error,
              monthLabel,
            });
            return;
          }

          await db
            .update(usersTable)
            .set({ lastDigestSentAt: sql`now()` })
            .where(eq(usersTable.id, user.id));
          console.log(`      ✓ ${user.email}`);
          results.push({ userId: user.id, email: user.email, status: "sent", monthLabel });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`      ✗ ${user.email}: ${reason}`);
          results.push({
            userId: user.id,
            email: user.email,
            status: "failed",
            reason,
            monthLabel,
          });
        }
      }),
    );

    if (i + opts.batchSize < dispatchable.length && opts.batchDelayMs > 0) {
      await sleep(opts.batchDelayMs);
    }
  }

  return { results, monthLabel };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOperatorSummaryEmail(
  results: SendResult[],
  monthLabel: string,
  err?: unknown,
): string {
  const { sent, skipped, failed } = summariseResults(results);
  const failuresList = results
    .filter((r) => r.status === "failed")
    .slice(0, 25)
    .map((r) => `<li>${escapeHtml(r.email)} — ${escapeHtml(r.reason ?? "unknown")}</li>`)
    .join("");
  const errorBlock = err
    ? `<pre style="background:#fee;padding:12px;border-radius:6px;font-size:12px;color:#a40000;white-space:pre-wrap;">${escapeHtml(
        err instanceof Error ? err.stack || err.message : String(err),
      )}</pre>`
    : "";
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 8px;color:#213547;font-size:20px;">My Impact — monthly digest dispatch (${escapeHtml(monthLabel)})</h2>
      <p style="margin:0 0 12px;color:#444;font-size:14px;">Run completed at ${escapeHtml(new Date().toISOString())} UTC.</p>
      <table style="border-collapse:collapse;font-size:14px;color:#213547;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Sent</td><td><strong style="color:#0a7c2f;">${sent}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Skipped</td><td>${skipped}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Failed</td><td><strong style="color:${failed ? "#a40000" : "#213547"};">${failed}</strong></td></tr>
      </table>
      ${failuresList ? `<p style="margin:16px 0 4px;color:#213547;"><strong>Failures (first 25):</strong></p><ul style="margin:0 0 0 18px;color:#444;font-size:13px;">${failuresList}</ul>` : ""}
      ${errorBlock}
      <p style="margin:24px 0 0;color:#888;font-size:12px;">Sent automatically by the My Impact monthly digest job.</p>
    </div>
  `;
}

async function maybeNotifyOperator(
  opts: Options,
  results: SendResult[],
  monthLabel: string,
  err?: unknown,
) {
  if (!opts.notify) return;
  const to = opts.notifyEmail ?? process.env.BACKUP_NOTIFY_EMAIL;
  if (!to) {
    console.warn(
      "      [notify] --notify was set but no recipient is configured (set --notify-email or BACKUP_NOTIFY_EMAIL).",
    );
    return;
  }
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { sent, skipped, failed } = summariseResults(results);
    const subject = err
      ? `My Impact — monthly digest FAILED (${monthLabel})`
      : `My Impact — monthly digest sent (${monthLabel}) · ${sent} sent / ${skipped} skipped / ${failed} failed`;
    const { error: sendError } = await client.emails.send({
      from: fromEmail,
      to,
      subject,
      html: buildOperatorSummaryEmail(results, monthLabel, err),
    });
    if (sendError) {
      console.error("Failed to send operator summary email:", sendError);
    } else {
      console.log(`      Operator summary sent to ${to}.`);
    }
  } catch (notifyErr) {
    console.error("Failed to send operator summary email:", notifyErr);
  }
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const argSet = new Set(argv);

  const opts: Options = {
    skipRecentlySent: argSet.has("--skip-recently-sent"),
    dryRun: argSet.has("--dry-run"),
    notify: argSet.has("--notify"),
    notifyEmail: parseStringArg(argv, "--notify-email"),
    batchSize: parseIntArg(argv, "--batch-size", 25) || 25,
    batchDelayMs: parseIntArg(argv, "--batch-delay-ms", 1000),
    singleUserEmail: parseStringArg(argv, "--user-email"),
  };

  let results: SendResult[] = [];
  let monthLabel = "";
  let runError: unknown = null;

  try {
    const out = await dispatchDigests(opts);
    results = out.results;
    monthLabel = out.monthLabel;
    const { sent, skipped, failed } = summariseResults(results);
    console.log(
      `\nDigest run complete: ${sent} sent, ${skipped} skipped, ${failed} failed.`,
    );
  } catch (err) {
    runError = err;
    console.error("Digest dispatcher crashed:", err);
  }

  await maybeNotifyOperator(opts, results, monthLabel || previousMonthRange().monthLabel, runError);

  try {
    await pool.end();
  } catch {}

  if (runError) throw runError;
}

main().catch(async (err) => {
  console.error("Monthly digest job failed:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});

// Suppress unused-import lints for helpers retained for future expansion.
void isNotNull;
