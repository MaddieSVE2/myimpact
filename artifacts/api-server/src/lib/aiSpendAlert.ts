import { db, aiAlertStateTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableResendClient } from "./resend.js";
import { getAdminEmails } from "./adminEmails.js";
import {
  AI_BUDGET_ALERT_USD,
  AI_GPT5_MINI_INPUT_PRICE_PER_1K,
  AI_GPT5_MINI_OUTPUT_PRICE_PER_1K,
  getMonthlyUsageReport,
} from "./aiUsage.js";

const ALERT_KEY = "monthly_budget";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000;

// Recipients = the same admin allowlist used to gate /api/admin endpoints
// (defaults baked in + ADMIN_EMAILS env var merged on top). This means
// the existing admin team always gets the alert email even if the env
// var is unset — closing the previous gap where an unset env var
// silently disabled budget alerting entirely.
function adminEmails(): string[] {
  return getAdminEmails();
}

async function getLastAlertAt(): Promise<Date | null> {
  const row = await db.query.aiAlertStateTable.findFirst({
    where: eq(aiAlertStateTable.key, ALERT_KEY),
  });
  return row?.lastSentAt ?? null;
}

async function recordAlertSent(): Promise<void> {
  await db.execute(sql`
    INSERT INTO ai_alert_state (key, last_sent_at)
    VALUES (${ALERT_KEY}, NOW())
    ON CONFLICT (key) DO UPDATE SET last_sent_at = NOW()
  `);
}

export async function runSpendAlertCheck(): Promise<void> {
  try {
    const report = await getMonthlyUsageReport();
    const estimatedUsd = report.totals.estimatedCostUsd;
    console.log(
      `[ai-spend-alert] check: month=${report.monthStart} estimated_usd=${estimatedUsd.toFixed(2)} ` +
        `threshold_usd=${AI_BUDGET_ALERT_USD} input_tokens=${report.totals.inputTokens} ` +
        `output_tokens=${report.totals.outputTokens}`
    );

    if (estimatedUsd < AI_BUDGET_ALERT_USD) return;

    const lastSent = await getLastAlertAt();
    if (lastSent && Date.now() - lastSent.getTime() < COOLDOWN_MS) {
      console.log(`[ai-spend-alert] within 24h cooldown (last sent ${lastSent.toISOString()}); skipping`);
      return;
    }

    const recipients = adminEmails();
    if (recipients.length === 0) {
      console.warn("[ai-spend-alert] threshold exceeded but ADMIN_EMAILS not configured; not sending");
      return;
    }

    const { client, fromEmail } = await getUncachableResendClient();
    const topRows = report.rows.slice(0, 10);
    const topRowsHtml = topRows
      .map((r) => `<tr><td style="padding:4px 12px 4px 0;">${escapeHtml(r.userKey)}</td><td style="padding:4px 0;text-align:right;">$${r.estimatedCostUsd.toFixed(2)}</td></tr>`) 
      .join("");

    await client.emails.send({
      from: fromEmail,
      to: recipients,
      subject: `[My Impact] AI spend alert — $${estimatedUsd.toFixed(2)} this month`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;color:#213547;">
          <h2 style="color:#E8633A;">AI spend alert</h2>
          <p>Estimated GPT-5-mini spend for the current month is <strong>$${estimatedUsd.toFixed(2)}</strong>, which exceeds the configured threshold of <strong>$${AI_BUDGET_ALERT_USD.toFixed(2)}</strong>.</p>
          <p style="color:#555;font-size:13px;">Tokens this month: ${report.totals.inputTokens.toLocaleString("en-GB")} input + ${report.totals.outputTokens.toLocaleString("en-GB")} output.</p>
          <p style="color:#555;font-size:13px;">Pricing assumed: $${AI_GPT5_MINI_INPUT_PRICE_PER_1K}/1K input, $${AI_GPT5_MINI_OUTPUT_PRICE_PER_1K}/1K output.</p>
          <h3>Top callers</h3>
          <table style="font-size:13px;border-collapse:collapse;">${topRowsHtml || "<tr><td>(none)</td></tr>"}</table>
          <p style="color:#888;font-size:12px;margin-top:32px;">No further alerts will be sent for the next 24 hours.</p>
        </div>
      `,
    });
    await recordAlertSent();
    console.log(`[ai-spend-alert] sent alert email to ${recipients.length} recipient(s)`);
  } catch (err) {
    console.error("[ai-spend-alert] check failed:", err);
  }
}

/**
 * Schedule the daily AI spend-alert check. Runs after a short startup
 * delay (so the process is fully up first) and then every 24 hours. The
 * timer is `unref`'d so it does not keep the event loop alive on shutdown.
 */
export function startAiSpendAlertJob(): void {
  const startup = setTimeout(() => {
    runSpendAlertCheck().catch(() => {});
    const recurring = setInterval(() => {
      runSpendAlertCheck().catch(() => {});
    }, CHECK_INTERVAL_MS);
    recurring.unref?.();
  }, STARTUP_DELAY_MS);
  startup.unref?.();
  console.log(
    `[ai-spend-alert] scheduled daily check (threshold $${AI_BUDGET_ALERT_USD}, recipients=${adminEmails().length})`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
