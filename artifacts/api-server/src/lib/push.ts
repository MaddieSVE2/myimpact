import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import {
  db,
  pushSubscriptionsTable,
  pushPreferencesTable,
  DEFAULT_PUSH_TRIGGERS,
  type PushTriggerToggles,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@myimpact.uk";
  if (!pub || !priv) {
    console.warn(
      "[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set — push notifications disabled.",
    );
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export type PushTriggerType = keyof PushTriggerToggles;

export interface PushPayload {
  title: string;
  body: string;
  /** App-relative path the click should open (e.g. "/history"). */
  url?: string;
  /** Trigger category — used for preference checks and analytics. */
  type: PushTriggerType;
  /** Optional tag so a new push of the same kind replaces the old. */
  tag?: string;
}

function normaliseTriggers(raw: unknown): PushTriggerToggles {
  if (raw && typeof raw === "object") {
    const r = raw as Partial<Record<keyof PushTriggerToggles, unknown>>;
    return {
      streakAtRisk: r.streakAtRisk !== false,
      recurringDue: r.recurringDue !== false,
      monthlyDigest: r.monthlyDigest !== false,
      challengeEnd: r.challengeEnd !== false,
    };
  }
  return { ...DEFAULT_PUSH_TRIGGERS };
}

export async function getEffectivePreferences(userId: string): Promise<{
  enabled: boolean;
  pausedUntil: Date | null;
  triggers: PushTriggerToggles;
}> {
  const [row] = await db
    .select()
    .from(pushPreferencesTable)
    .where(eq(pushPreferencesTable.userId, userId))
    .limit(1);
  if (!row) {
    return { enabled: true, pausedUntil: null, triggers: { ...DEFAULT_PUSH_TRIGGERS } };
  }
  return {
    enabled: row.enabled,
    pausedUntil: row.pausedUntil,
    triggers: normaliseTriggers(row.triggers),
  };
}

/**
 * Send a push to every active subscription for a single user. Honours the
 * user's stored preferences (per-trigger toggles + pause-until timestamp).
 *
 * Auto-prunes endpoints that respond 404 / 410 (subscription expired).
 *
 * Returns the number of subscriptions a push was successfully delivered to.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureVapidConfigured()) return 0;

  const prefs = await getEffectivePreferences(userId);
  if (!prefs.enabled) return 0;
  if (prefs.pausedUntil && prefs.pausedUntil.getTime() > Date.now()) return 0;
  if (prefs.triggers[payload.type] === false) return 0;

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  if (subs.length === 0) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    type: payload.type,
    tag: payload.tag ?? payload.type,
  });

  const expiredIds: number[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      const sub: WebPushSubscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(sub, body, { TTL: 60 * 60 * 24 });
        delivered++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          expiredIds.push(s.id);
        } else {
          console.error("[push] delivery error:", status, (err as Error)?.message);
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await db
      .delete(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.id, expiredIds));
  }

  if (delivered > 0) {
    await db
      .update(pushSubscriptionsTable)
      .set({ lastNotifiedAt: new Date() })
      .where(eq(pushSubscriptionsTable.userId, userId));
  }

  return delivered;
}

/** Convenience: send the same push to many users in parallel (e.g. a digest run). */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  let total = 0;
  await Promise.all(
    userIds.map(async (id) => {
      total += await sendPushToUser(id, payload);
    }),
  );
  return total;
}

/** Best-effort no-throw wrapper for use inside critical user-facing handlers. */
export async function sendPushSafely(userId: string, payload: PushPayload): Promise<void> {
  try {
    await sendPushToUser(userId, payload);
  } catch (err) {
    console.error("[push] sendPushSafely error:", (err as Error)?.message);
  }
}

void and;
