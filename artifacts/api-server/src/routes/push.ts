import { Router, type IRouter } from "express";
import { db, pushSubscriptionsTable, pushPreferencesTable, DEFAULT_PUSH_TRIGGERS, type PushTriggerToggles } from "@workspace/db";
import { and, eq, count, sql } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getVapidPublicKey, sendPushToUser, getEffectivePreferences } from "../lib/push.js";
import { createRateLimiter } from "../lib/rateLimiter.js";

const router: IRouter = Router();

const MAX_SUBSCRIPTIONS_PER_USER = 10;
const MAX_ENDPOINT_LENGTH = 2000;
const MAX_P256DH_LENGTH = 200;
const MAX_AUTH_LENGTH = 100;

const pushTestRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many push test requests. Please slow down.",
});

/**
 * Returns true if the hostname looks like a private or loopback address
 * that should never appear in a real browser push-service URL.
 */
function isPrivateHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }

  // IPv6 loopback and private ranges (bracket notation from URL parser)
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (bare === "::1") return true;
  if (/^::ffff:/i.test(bare)) {
    // IPv4-mapped IPv6 — check the embedded IPv4 part
    const v4 = bare.slice(7);
    const ipv4mapped = v4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4mapped) {
      const [, a, b] = ipv4mapped.map(Number);
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }
  }
  // fc00::/7 — unique local addresses (fd...)
  if (/^f[cd]/i.test(bare)) return true;
  // fe80::/10 — link-local
  if (/^fe[89ab]/i.test(bare)) return true;

  return false;
}

/**
 * Allowlist of hostname suffixes that correspond to real browser push services.
 * Browsers register endpoints only with their vendor-operated push services;
 * any other hostname is not a legitimate browser push endpoint.
 *
 * Sources:
 *   - Chrome/Android (FCM): fcm.googleapis.com, fcm-push.googleapis.com
 *   - Firefox (Mozilla): *.push.services.mozilla.com
 *   - Edge/Windows: *.notify.windows.com, *.wns.windows.com
 *   - Safari/Apple: *.push.apple.com
 *   - Opera: *.push.opera.com
 *   - Samsung Internet: *.push.samsungcloud.com
 */
const ALLOWED_PUSH_HOSTNAME_SUFFIXES: readonly string[] = [
  ".fcm.googleapis.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
  ".wns.windows.com",
  ".push.apple.com",
  ".push.opera.com",
  ".push.samsungcloud.com",
];

const ALLOWED_PUSH_EXACT_HOSTNAMES: readonly string[] = [
  "fcm.googleapis.com",
  "fcm-push.googleapis.com",
  "updates.push.services.mozilla.com",
];

function isAllowedPushHost(hostname: string): boolean {
  if (ALLOWED_PUSH_EXACT_HOSTNAMES.includes(hostname)) return true;
  for (const suffix of ALLOWED_PUSH_HOSTNAME_SUFFIXES) {
    if (hostname === suffix.slice(1) || hostname.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Validate that the endpoint is an HTTPS URL from a known browser push service.
 * Returns an error string if invalid, or null if acceptable.
 */
function validatePushEndpoint(endpoint: string): string | null {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) {
    return `endpoint must not exceed ${MAX_ENDPOINT_LENGTH} characters`;
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "endpoint must be a valid URL";
  }

  if (url.protocol !== "https:") {
    return "endpoint must use HTTPS";
  }

  if (isPrivateHostname(url.hostname)) {
    return "endpoint hostname is not allowed";
  }

  if (!isAllowedPushHost(url.hostname)) {
    return "endpoint must be a browser push service URL";
  }

  return null;
}

router.get("/public-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Push notifications not configured." });
    return;
  }
  res.json({ publicKey: key });
});

interface SubscribeBody {
  endpoint?: unknown;
  keys?: unknown;
  userAgent?: unknown;
}

router.post("/subscribe", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = (req.body ?? {}) as SubscribeBody;

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const keys = body.keys && typeof body.keys === "object" ? (body.keys as Record<string, unknown>) : null;
  const p256dh = keys && typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = keys && typeof keys.auth === "string" ? keys.auth : "";
  const userAgent = typeof body.userAgent === "string" ? body.userAgent.slice(0, 500) : null;

  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "endpoint and keys.p256dh / keys.auth are required" });
    return;
  }

  const endpointError = validatePushEndpoint(endpoint);
  if (endpointError) {
    res.status(400).json({ error: endpointError });
    return;
  }

  if (p256dh.length > MAX_P256DH_LENGTH) {
    res.status(400).json({ error: `keys.p256dh must not exceed ${MAX_P256DH_LENGTH} characters` });
    return;
  }

  if (auth.length > MAX_AUTH_LENGTH) {
    res.status(400).json({ error: `keys.auth must not exceed ${MAX_AUTH_LENGTH} characters` });
    return;
  }

  // Upsert by endpoint (each browser creates one unique endpoint per service worker scope).
  // For existing endpoints we just update — no cap concern since it's already counted.
  const existing = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushSubscriptionsTable)
      .set({ userId, p256dh, auth, userAgent, lastSeenAt: new Date() })
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
  } else {
    // Acquire a per-user advisory lock inside a transaction so that parallel
    // subscribe requests cannot each read the same subscription count and all
    // insert beyond MAX_SUBSCRIPTIONS_PER_USER.
    let capExceeded = false;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(('x' || substr(md5('push_sub:' || ${userId}), 1, 15))::bit(60)::bigint)`
      );

      const [countRow] = await tx
        .select({ c: count() })
        .from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.userId, userId));

      if (Number(countRow?.c ?? 0) >= MAX_SUBSCRIPTIONS_PER_USER) {
        capExceeded = true;
        return;
      }

      await tx.insert(pushSubscriptionsTable).values({
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent,
      });
    });

    if (capExceeded) {
      res.status(429).json({
        error: `Maximum ${MAX_SUBSCRIPTIONS_PER_USER} push subscriptions per user.`,
      });
      return;
    }
  }

  // Make sure preferences row exists with sensible defaults.
  const prefs = await db
    .select()
    .from(pushPreferencesTable)
    .where(eq(pushPreferencesTable.userId, userId))
    .limit(1);
  if (prefs.length === 0) {
    await db.insert(pushPreferencesTable).values({
      userId,
      enabled: true,
      pausedUntil: null,
      triggers: DEFAULT_PUSH_TRIGGERS,
    });
  }

  res.json({ ok: true });
});

router.post("/unsubscribe", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = (req.body ?? {}) as { endpoint?: unknown; all?: unknown };

  if (body.all === true) {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
    res.json({ ok: true });
    return;
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) {
    res.status(400).json({ error: "endpoint or all=true required" });
    return;
  }
  await db
    .delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));
  res.json({ ok: true });
});

router.get("/preferences", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const prefs = await getEffectivePreferences(userId);
  const subs = await db
    .select({ id: pushSubscriptionsTable.id, endpoint: pushSubscriptionsTable.endpoint, userAgent: pushSubscriptionsTable.userAgent })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  res.json({
    enabled: prefs.enabled,
    pausedUntil: prefs.pausedUntil ? prefs.pausedUntil.toISOString() : null,
    triggers: prefs.triggers,
    subscriptions: subs.map((s) => ({
      id: String(s.id),
      endpoint: s.endpoint,
      userAgent: s.userAgent,
    })),
  });
});

interface PreferencesBody {
  enabled?: unknown;
  pauseDays?: unknown;
  resumeNow?: unknown;
  triggers?: unknown;
}

router.patch("/preferences", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = (req.body ?? {}) as PreferencesBody;

  const updates: {
    enabled?: boolean;
    pausedUntil?: Date | null;
    triggers?: PushTriggerToggles;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;

  if (body.resumeNow === true) {
    updates.pausedUntil = null;
  } else if (typeof body.pauseDays === "number" && Number.isFinite(body.pauseDays)) {
    if (body.pauseDays <= 0) {
      updates.pausedUntil = null;
    } else if (body.pauseDays > 90) {
      res.status(400).json({ error: "pauseDays cannot exceed 90" });
      return;
    } else {
      updates.pausedUntil = new Date(Date.now() + body.pauseDays * 24 * 60 * 60 * 1000);
    }
  }

  if (body.triggers && typeof body.triggers === "object") {
    const t = body.triggers as Partial<PushTriggerToggles>;
    const current = await getEffectivePreferences(userId);
    updates.triggers = {
      streakAtRisk: typeof t.streakAtRisk === "boolean" ? t.streakAtRisk : current.triggers.streakAtRisk,
      recurringDue: typeof t.recurringDue === "boolean" ? t.recurringDue : current.triggers.recurringDue,
      monthlyDigest: typeof t.monthlyDigest === "boolean" ? t.monthlyDigest : current.triggers.monthlyDigest,
      challengeEnd: typeof t.challengeEnd === "boolean" ? t.challengeEnd : current.triggers.challengeEnd,
    };
  }

  const existing = await db
    .select()
    .from(pushPreferencesTable)
    .where(eq(pushPreferencesTable.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(pushPreferencesTable).values({
      userId,
      enabled: updates.enabled ?? true,
      pausedUntil: updates.pausedUntil ?? null,
      triggers: updates.triggers ?? DEFAULT_PUSH_TRIGGERS,
    });
  } else {
    await db
      .update(pushPreferencesTable)
      .set(updates)
      .where(eq(pushPreferencesTable.userId, userId));
  }

  const final = await getEffectivePreferences(userId);
  res.json({
    enabled: final.enabled,
    pausedUntil: final.pausedUntil ? final.pausedUntil.toISOString() : null,
    triggers: final.triggers,
  });
});

router.post("/test", authenticate, pushTestRateLimit, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const sent = await sendPushToUser(userId, {
    title: "Reminders are on",
    body: "We'll nudge you here when something useful happens. You can pause or turn this off in Settings any time.",
    url: "/settings",
    type: "streakAtRisk",
    tag: "test",
  });
  if (sent === 0) {
    res.status(409).json({ error: "No active subscriptions, or notifications are paused / disabled." });
    return;
  }
  res.json({ ok: true, delivered: sent });
});

export default router;
