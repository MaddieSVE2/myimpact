import { createHmac, randomUUID } from "crypto";
import { promises as dns } from "dns";
import { db, orgWebhooksTable, webhookDeliveriesTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";

/**
 * Patterns matching IP addresses that must never be the target of an outbound
 * webhook request. Includes loopback, RFC-1918, link-local, CGNAT, and the
 * IPv6 equivalents so that a stored HTTPS URL cannot be used as an SSRF
 * vector against internal services — even via DNS rebinding.
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,                                         // IPv4 loopback
  /^10\./,                                          // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,                    // RFC 1918
  /^192\.168\./,                                    // RFC 1918
  /^169\.254\./,                                    // link-local (APIPA)
  /^100\.(6[4-9]|[7-9]\d|1([01]\d|2[0-7]))\./,    // CGNAT (RFC 6598)
  /^0\./,                                           // "this" network
  /^::1$/,                                          // IPv6 loopback
  /^fc/i,                                           // IPv6 ULA (fc00::/7)
  /^fd/i,                                           // IPv6 ULA (fd00::/8)
  /^fe80:/i,                                        // IPv6 link-local
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(r => r.test(ip));
}

/**
 * Resolves the hostname of `urlStr` via DNS and returns `false` if any
 * resolved address is in a private or reserved range, guarding against SSRF
 * and DNS-rebinding attacks. Returns `false` also when the hostname cannot be
 * resolved at all (fail-closed).
 */
async function isSafeWebhookUrl(urlStr: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname;
  } catch {
    return false;
  }

  const [v4, v6] = await Promise.all([
    dns.resolve4(hostname).catch(() => [] as string[]),
    dns.resolve6(hostname).catch(() => [] as string[]),
  ]);
  const addresses = [...v4, ...v6];

  // Fail-closed: if DNS returns nothing we cannot safely proceed.
  if (addresses.length === 0) return false;

  return !addresses.some(isPrivateIp);
}

export type WebhookEvent =
  | "member.joined"
  | "hours.logged"
  | "hours.attested"
  | "hours.verified"
  | "hours.updated"
  | "hours.withdrawn"
  | "milestone.earned";

export const SUPPORTED_EVENTS: WebhookEvent[] = [
  "member.joined",
  "hours.logged",
  "hours.attested",
  "hours.verified",
  "hours.updated",
  "hours.withdrawn",
  "milestone.earned",
];

interface EnqueueArgs {
  orgId: string;
  eventType: WebhookEvent;
  payload: Record<string, unknown>;
}

/**
 * Enqueue an event for delivery to every enabled webhook for an org that has
 * subscribed to this event type. Each webhook gets its own delivery row.
 */
export async function enqueueOrgEvent({ orgId, eventType, payload }: EnqueueArgs): Promise<void> {
  const subscribers = await db.query.orgWebhooksTable.findMany({
    where: and(eq(orgWebhooksTable.orgId, orgId), eq(orgWebhooksTable.enabled, true)),
  });

  const matching = subscribers.filter(w => w.events.includes(eventType) || w.events.includes("*"));
  if (matching.length === 0) return;

  const eventId = randomUUID();
  const wrappedPayload = {
    id: eventId,
    type: eventType,
    orgId,
    createdAt: new Date().toISOString(),
    data: payload,
  };

  await db.insert(webhookDeliveriesTable).values(
    matching.map(w => ({
      id: randomUUID(),
      webhookId: w.id,
      eventType,
      payload: wrappedPayload,
      status: "pending" as const,
      attempts: 0,
      nextAttemptAt: new Date(),
    })),
  );
}

export function signPayload(secret: string, body: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

interface AttemptResult { ok: boolean; status?: number; error?: string }

async function attemptDelivery(url: string, secret: string, payload: unknown): Promise<AttemptResult> {
  // Resolve the destination hostname and reject any address that falls within
  // a private/reserved range. This runs at delivery time (not just at
  // registration) to prevent DNS-rebinding attacks, where an initially safe
  // hostname is later made to resolve to an internal address.
  const safe = await isSafeWebhookUrl(url);
  if (!safe) {
    return { ok: false, error: "Webhook URL resolves to a disallowed (private/internal) address" };
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(secret, body, timestamp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MyImpact-Webhooks/1.0",
        "X-MyImpact-Signature": signature,
        "X-MyImpact-Event": typeof (payload as { type?: string }).type === "string" ? (payload as { type?: string }).type! : "",
      },
      body,
      redirect: "error",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

/**
 * Compute the next retry delay using exponential backoff with jitter.
 * attempts: how many attempts have already been made (1, 2, 3, …).
 * Returns ms.
 */
export function computeBackoffMs(attempts: number): number {
  // 1m, 2m, 4m, 8m, 16m, 32m, 60m (cap)
  const base = Math.min(60, Math.pow(2, attempts - 1));
  const jitter = Math.random() * 0.25 * base;
  return Math.round((base + jitter) * 60 * 1000);
}

const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 25;

let dispatcherTimer: NodeJS.Timeout | null = null;
let dispatcherRunning = false;

/**
 * Process up to BATCH_SIZE pending deliveries that are due. Called on a
 * timer (every 30s) by `startWebhookDispatcher`.
 */
export async function processPendingDeliveries(): Promise<void> {
  if (dispatcherRunning) return;
  dispatcherRunning = true;
  try {
    const now = new Date();
    const due = await db
      .select()
      .from(webhookDeliveriesTable)
      .where(and(eq(webhookDeliveriesTable.status, "pending"), lte(webhookDeliveriesTable.nextAttemptAt, now)))
      .limit(BATCH_SIZE);

    for (const delivery of due) {
      const webhook = await db.query.orgWebhooksTable.findFirst({
        where: eq(orgWebhooksTable.id, delivery.webhookId),
      });

      if (!webhook || !webhook.enabled || webhook.deadAt) {
        await db.update(webhookDeliveriesTable)
          .set({ status: "dead", lastError: "Webhook disabled or removed", lastAttemptAt: new Date() })
          .where(eq(webhookDeliveriesTable.id, delivery.id));
        continue;
      }

      const attemptedAt = new Date();
      const firstAttemptAt = delivery.firstAttemptAt ?? attemptedAt;

      const result = await attemptDelivery(webhook.url, webhook.secret, delivery.payload);
      const newAttempts = delivery.attempts + 1;

      if (result.ok) {
        await db.update(webhookDeliveriesTable)
          .set({
            status: "delivered",
            attempts: newAttempts,
            firstAttemptAt,
            lastAttemptAt: attemptedAt,
            deliveredAt: attemptedAt,
            lastResponseStatus: result.status ?? null,
            lastError: null,
          })
          .where(eq(webhookDeliveriesTable.id, delivery.id));
        await db.update(orgWebhooksTable)
          .set({ lastSuccessAt: attemptedAt, lastError: null })
          .where(eq(orgWebhooksTable.id, webhook.id));
        continue;
      }

      // Failure path: backoff or mark dead.
      const elapsedMs = attemptedAt.getTime() - firstAttemptAt.getTime();
      const wouldExceedWindow = elapsedMs >= RETRY_WINDOW_MS;

      if (wouldExceedWindow) {
        await db.update(webhookDeliveriesTable)
          .set({
            status: "dead",
            attempts: newAttempts,
            firstAttemptAt,
            lastAttemptAt: attemptedAt,
            lastResponseStatus: result.status ?? null,
            lastError: result.error ?? "Failed",
          })
          .where(eq(webhookDeliveriesTable.id, delivery.id));

        await db.update(orgWebhooksTable)
          .set({ deadAt: attemptedAt, enabled: false, lastFailureAt: attemptedAt, lastError: result.error ?? "Failed" })
          .where(eq(orgWebhooksTable.id, webhook.id));
        continue;
      }

      const nextAttemptAt = new Date(attemptedAt.getTime() + computeBackoffMs(newAttempts));
      await db.update(webhookDeliveriesTable)
        .set({
          status: "pending",
          attempts: newAttempts,
          firstAttemptAt,
          lastAttemptAt: attemptedAt,
          nextAttemptAt,
          lastResponseStatus: result.status ?? null,
          lastError: result.error ?? "Failed",
        })
        .where(eq(webhookDeliveriesTable.id, delivery.id));
      await db.update(orgWebhooksTable)
        .set({ lastFailureAt: attemptedAt, lastError: result.error ?? "Failed" })
        .where(eq(orgWebhooksTable.id, webhook.id));
    }
  } catch (err) {
    console.error("[webhook dispatcher] error:", err);
  } finally {
    dispatcherRunning = false;
  }
}

/**
 * Start the in-process dispatcher. Polls every 30 seconds. Safe to call
 * multiple times — only the first call starts the timer.
 */
export function startWebhookDispatcher(): void {
  if (dispatcherTimer) return;
  dispatcherTimer = setInterval(() => {
    processPendingDeliveries().catch(err => console.error("[webhook dispatcher] tick error:", err));
  }, 30_000);
  if (dispatcherTimer.unref) dispatcherTimer.unref();
  // Run once on boot to flush anything left over from a restart.
  processPendingDeliveries().catch(err => console.error("[webhook dispatcher] boot error:", err));
}

export function stopWebhookDispatcher(): void {
  if (dispatcherTimer) {
    clearInterval(dispatcherTimer);
    dispatcherTimer = null;
  }
}

// Mark `sql` as used to avoid tree-shaking complaints on some toolchains.
void sql;
