import { Router, type IRouter } from "express";
import { db, pushSubscriptionsTable, pushPreferencesTable, DEFAULT_PUSH_TRIGGERS, type PushTriggerToggles } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getVapidPublicKey, sendPushToUser, getEffectivePreferences } from "../lib/push.js";

const router: IRouter = Router();

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

  // Upsert by endpoint (each browser creates one unique endpoint per service worker scope).
  const existing = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushSubscriptionsTable)
      .set({ userId, p256dh, auth, userAgent, lastSeenAt: new Date() })
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
  } else {
    await db.insert(pushSubscriptionsTable).values({
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent,
    });
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

router.post("/test", authenticate, async (req: AuthenticatedRequest, res) => {
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
