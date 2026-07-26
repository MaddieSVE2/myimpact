import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getUncachableResendClient } from "./resend.js";
import { getAdminEmails } from "./adminEmails.js";

/**
 * Sidekick chat failure alerting.
 *
 * The sidekick chat route logs failures ([sidekick-chat] error /
 * empty-stream / first-token-timeout) but nobody watches logs in real
 * time. This module keeps an in-memory sliding-window counter of chat
 * failures and emails the admin allowlist (same recipients as the AI
 * spend alert) when failures spike, rate-limited via the shared
 * ai_alert_state table so restarts / multiple hot paths can't spam.
 *
 * Counter is in-memory by design: an outage burst happens within one
 * process lifetime, and losing the counter on restart only delays (not
 * loses) an alert while failures continue.
 */

export type SidekickFailureType = "error" | "empty-stream" | "first-token-timeout";

const ALERT_KEY = "sidekick_chat_failures";
const WINDOW_MS = 60 * 60 * 1000; // 1 hour sliding window
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // at most one email every 6 hours

const DEFAULT_THRESHOLD = 5;
const FAILURE_THRESHOLD = parseThreshold(process.env.SIDEKICK_FAILURE_ALERT_THRESHOLD);

function parseThreshold(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_THRESHOLD;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    console.warn(
      `[sidekick-failure-alert] invalid SIDEKICK_FAILURE_ALERT_THRESHOLD="${raw}"; using default ${DEFAULT_THRESHOLD}`
    );
    return DEFAULT_THRESHOLD;
  }
  return Math.floor(n);
}

type FailureEvent = { at: number; type: SidekickFailureType; upstreamStatus?: string };

const events: FailureEvent[] = [];
const dailyCounts = new Map<string, number>(); // yyyy-mm-dd -> count (for the email + logs)
let alertInFlight = false;

function pruneWindow(now: number): void {
  while (events.length > 0 && events[0]!.at < now - WINDOW_MS) {
    events.shift();
  }
}

function bumpDailyCount(now: number): number {
  const day = new Date(now).toISOString().slice(0, 10);
  const next = (dailyCounts.get(day) ?? 0) + 1;
  dailyCounts.set(day, next);
  // Keep only today + yesterday so the map never grows unbounded.
  for (const key of dailyCounts.keys()) {
    if (key !== day && key < new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)) {
      dailyCounts.delete(key);
    }
  }
  return next;
}

/**
 * Atomically claim the right to send an alert. A single conditional
 * upsert updates last_sent_at only if the cooldown has expired; exactly
 * one process wins the claim even with concurrent callers, so scaled-out
 * production instances can't each send their own email.
 */
async function tryAcquireAlertSlot(): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO ai_alert_state (key, last_sent_at)
    VALUES (${ALERT_KEY}, NOW())
    ON CONFLICT (key) DO UPDATE SET last_sent_at = NOW()
    WHERE ai_alert_state.last_sent_at < NOW() - make_interval(secs => ${COOLDOWN_MS / 1000})
    RETURNING key
  `);
  return (result.rows?.length ?? 0) > 0;
}

/**
 * Record one sidekick chat failure. Fire-and-forget: never throws, never
 * blocks the request path. Call from the chat route's failure branches.
 */
export function recordSidekickChatFailure(
  type: SidekickFailureType,
  upstreamStatus?: string | number
): void {
  try {
    const now = Date.now();
    pruneWindow(now);
    events.push({ at: now, type, upstreamStatus: upstreamStatus?.toString() });
    const dayCount = bumpDailyCount(now);
    console.log(
      `[sidekick-failure-alert] recorded type=${type} hour_count=${events.length} ` +
        `day_count=${dayCount} threshold=${FAILURE_THRESHOLD}`
    );
    if (events.length >= FAILURE_THRESHOLD && !alertInFlight) {
      alertInFlight = true;
      void maybeSendAlert(dayCount)
        .catch((err) => console.error("[sidekick-failure-alert] alert send failed:", err))
        .finally(() => {
          alertInFlight = false;
        });
    }
  } catch (err) {
    console.error("[sidekick-failure-alert] record failed:", err);
  }
}

async function maybeSendAlert(dayCount: number): Promise<void> {
  const recipients = getAdminEmails();
  if (recipients.length === 0) {
    console.warn("[sidekick-failure-alert] threshold hit but no admin emails configured; not sending");
    return;
  }

  // Atomic claim: only one process (and one attempt per cooldown window)
  // gets past this point, even across concurrent instances.
  const acquired = await tryAcquireAlertSlot();
  if (!acquired) {
    console.log("[sidekick-failure-alert] threshold hit but within 6h cooldown; skipping");
    return;
  }

  const now = Date.now();
  pruneWindow(now);
  const hourCount = events.length;
  const byType = new Map<string, number>();
  for (const e of events) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  const statuses = [...new Set(events.map((e) => e.upstreamStatus).filter(Boolean))];

  const breakdownHtml = [...byType.entries()]
    .map(
      ([type, count]) =>
        `<tr><td style="padding:4px 12px 4px 0;">${escapeHtml(type)}</td><td style="padding:4px 0;text-align:right;">${count}</td></tr>`
    )
    .join("");

  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: fromEmail,
    to: recipients,
    subject: `[My Impact] Sidekick chat failures — ${hourCount} in the last hour`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;color:#213547;">
        <h2 style="color:#E8633A;">Sidekick chat is failing</h2>
        <p><strong>${hourCount}</strong> chat failures in the last hour (threshold ${FAILURE_THRESHOLD}); <strong>${dayCount}</strong> so far today.</p>
        <h3>Failures by type (last hour)</h3>
        <table style="font-size:13px;border-collapse:collapse;">${breakdownHtml || "<tr><td>(none)</td></tr>"}</table>
        ${statuses.length > 0 ? `<p style="color:#555;font-size:13px;">Upstream statuses seen: ${statuses.map((s) => escapeHtml(String(s))).join(", ")}</p>` : ""}
        <p style="color:#555;font-size:13px;">Check the production logs for <code>[sidekick-chat]</code> entries for per-request detail (user key, upstream status).</p>
        <p style="color:#888;font-size:12px;margin-top:32px;">No further Sidekick failure alerts will be sent for the next 6 hours.</p>
      </div>
    `,
  });
  console.log(`[sidekick-failure-alert] sent alert email to ${recipients.length} recipient(s)`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
