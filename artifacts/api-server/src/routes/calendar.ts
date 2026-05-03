import { Router, type IRouter } from "express";
import { db, calendarSourcesTable, calendarEventsTable } from "@workspace/db";
import { and, eq, gt, gte, lt, lte, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import {
  assertCalendarOwnership,
  CalendarOwnershipError,
  ConnectorNotConfiguredError,
  getPrimaryCalendar,
  isConnectorReady,
  revokeProviderToken,
  type CalendarProvider,
} from "../lib/calendarProviders.js";
import { syncSource } from "../lib/calendarSync.js";

const router: IRouter = Router();

function isProvider(v: unknown): v is CalendarProvider {
  return v === "google" || v === "microsoft";
}

function newId() {
  return randomBytes(12).toString("hex");
}

function serializeSource(s: typeof calendarSourcesTable.$inferSelect) {
  return {
    id: s.id,
    provider: s.provider,
    calendarId: s.calendarId ?? null,
    calendarName: s.calendarName ?? null,
    filterText: s.filterText ?? null,
    status: s.status,
    providerAccountEmail: s.providerAccountEmail ?? null,
    lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: s.lastSyncError ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

/**
 * GET /api/calendar/status — connector readiness for both providers.
 *
 * Security: accountEmail is NOT included in the response even though
 * isConnectorReady() returns it. Exposing the connector account email to
 * every authenticated user discloses the identity of the calendar owner
 * across user trust boundaries. The status endpoint only returns the
 * boolean connection state.
 */
router.get("/status", authenticate, async (_req: AuthenticatedRequest, res) => {
  const [google, microsoft] = await Promise.all([
    isConnectorReady("google"),
    isConnectorReady("microsoft"),
  ]);
  res.json({
    google: { connected: google.connected, reason: google.reason },
    microsoft: { connected: microsoft.connected, reason: microsoft.reason },
  });
});

/* GET /api/calendar/sources — list the user's sources. */
router.get("/sources", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(calendarSourcesTable)
    .where(eq(calendarSourcesTable.userId, userId))
    .orderBy(desc(calendarSourcesTable.createdAt));
  res.json({ sources: rows.map(serializeSource) });
});

/**
 * GET /api/calendar/calendars/:provider
 *
 * Returns ONLY the primary calendar for the authenticated user.
 *
 * Access is restricted to the user whose application email matches the
 * connected account's email (assertCalendarOwnership). Any other user
 * receives 403 — they would otherwise be reading calendar metadata from
 * an account that does not belong to them via the shared deployment-wide
 * connector.
 */
router.get("/calendars/:provider", authenticate, async (req: AuthenticatedRequest, res) => {
  const provider = req.params.provider;
  if (!isProvider(provider)) {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }
  try {
    await assertCalendarOwnership(req.user!.email, provider);
    const { calendar, accountEmail } = await getPrimaryCalendar(provider);
    res.json({ accountEmail, calendars: [calendar] });
  } catch (err) {
    if (err instanceof CalendarOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof ConnectorNotConfiguredError) {
      res.status(409).json({
        error: "Connector not configured",
        code: "CONNECTOR_NOT_CONFIGURED",
        message: err.message,
      });
      return;
    }
    console.error("getPrimaryCalendar failed:", err);
    res.status(502).json({ error: "Could not load calendar from provider" });
  }
});

/**
 * POST /api/calendar/sources — create a source for the current user.
 *
 * Security: client-supplied calendarId is IGNORED. The server always fetches
 * the primary calendar from the connector and uses that as the calendarId.
 * This prevents any user from injecting an arbitrary calendar ID to read
 * events from a calendar that does not belong to the connected account, or
 * from reading a secondary (non-primary) calendar that belongs to another
 * person on the same account. Only filterText is accepted from the client.
 */
router.post("/sources", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { provider, filterText } = req.body ?? {};

  if (!isProvider(provider)) {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }
  if (filterText !== null && filterText !== undefined && typeof filterText !== "string") {
    res.status(400).json({ error: "filterText must be a string or null" });
    return;
  }

  // Enforce connector ownership: the user's app email must match the
  // connected calendar account's email. This is a hard identity check —
  // not just "first come first served" — so no other user can ever claim
  // the shared connector even if no active source exists yet.
  try {
    await assertCalendarOwnership(req.user!.email, provider);
  } catch (err) {
    if (err instanceof CalendarOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof ConnectorNotConfiguredError) {
      res.status(409).json({
        error: "Connector not connected",
        code: "CONNECTOR_NOT_CONFIGURED",
        message: (err as Error).message,
      });
      return;
    }
    console.error("assertCalendarOwnership failed:", err);
    res.status(502).json({ error: "Could not verify calendar ownership." });
    return;
  }

  // Fetch the primary calendar server-side — client cannot supply calendarId.
  let primaryCalendar: Awaited<ReturnType<typeof getPrimaryCalendar>>;
  try {
    primaryCalendar = await getPrimaryCalendar(provider);
  } catch (err) {
    if (err instanceof ConnectorNotConfiguredError) {
      res.status(409).json({
        error: "Connector not connected",
        code: "CONNECTOR_NOT_CONFIGURED",
        message: err.message,
      });
      return;
    }
    console.error("getPrimaryCalendar failed:", err);
    res.status(502).json({ error: "Could not load calendar from provider." });
    return;
  }

  const { calendar: primary, accountEmail } = primaryCalendar;
  const trimmedFilter =
    typeof filterText === "string" ? filterText.trim().slice(0, 200) : null;

  // One source per provider per user — replace if it already exists.
  const existing = await db.query.calendarSourcesTable.findFirst({
    where: and(
      eq(calendarSourcesTable.userId, userId),
      eq(calendarSourcesTable.provider, provider),
    ),
  });

  let row;
  if (existing) {
    [row] = await db
      .update(calendarSourcesTable)
      .set({
        calendarId: primary.id,
        calendarName: primary.name.slice(0, 200),
        filterText: trimmedFilter || null,
        status: "active",
        providerAccountEmail: accountEmail,
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(calendarSourcesTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(calendarSourcesTable)
      .values({
        id: newId(),
        userId,
        provider,
        calendarId: primary.id,
        calendarName: primary.name.slice(0, 200),
        filterText: trimmedFilter || null,
        providerAccountEmail: accountEmail,
        status: "active",
      })
      .returning();
  }

  // Kick off an immediate sync — non-blocking from the user's POV but we
  // await it so the UI can show events right away.
  try {
    await syncSource(row);
    const refreshed = await db.query.calendarSourcesTable.findFirst({
      where: eq(calendarSourcesTable.id, row.id),
    });
    res.json({ source: serializeSource(refreshed ?? row) });
    return;
  } catch (err) {
    console.error("Initial calendar sync failed:", err);
    res.json({
      source: serializeSource(row),
      warning: "Saved, but the first sync didn't complete. We'll retry shortly.",
    });
  }
});

/**
 * PATCH /api/calendar/sources/:id — update filter text on an existing source.
 *
 * Security: calendarId cannot be changed after source creation. The calendar
 * is always the primary calendar of the connected account (set server-side
 * during POST). Only filterText and calendarName (display label) are accepted.
 */
router.patch("/sources/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const existing = await db.query.calendarSourcesTable.findFirst({
    where: and(
      eq(calendarSourcesTable.id, id),
      eq(calendarSourcesTable.userId, userId),
    ),
  });
  if (!existing) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  const { calendarName, filterText } = req.body ?? {};
  const updates: Partial<typeof calendarSourcesTable.$inferInsert> = { updatedAt: new Date() };
  if (calendarName !== undefined) {
    updates.calendarName =
      typeof calendarName === "string" ? calendarName.slice(0, 200) : null;
  }
  if (filterText !== undefined) {
    if (filterText !== null && typeof filterText !== "string") {
      res.status(400).json({ error: "filterText must be a string or null" });
      return;
    }
    updates.filterText =
      typeof filterText === "string" ? filterText.trim().slice(0, 200) || null : null;
  }
  const [updated] = await db
    .update(calendarSourcesTable)
    .set(updates)
    .where(eq(calendarSourcesTable.id, id))
    .returning();

  // Re-sync so the cache reflects the new filter.
  try {
    await syncSource(updated);
    const refreshed = await db.query.calendarSourcesTable.findFirst({
      where: eq(calendarSourcesTable.id, id),
    });
    res.json({ source: serializeSource(refreshed ?? updated) });
  } catch (err) {
    console.error("Calendar re-sync failed:", err);
    res.json({ source: serializeSource(updated) });
  }
});

/* DELETE /api/calendar/sources/:id — disconnect and revoke. */
router.delete("/sources/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const existing = await db.query.calendarSourcesTable.findFirst({
    where: and(
      eq(calendarSourcesTable.id, id),
      eq(calendarSourcesTable.userId, userId),
    ),
  });
  if (!existing) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  // Revoke provider token only if the deleting user owns the connector
  // (their app email matches the connected account email). A non-owner user
  // cannot trigger a deployment-wide revocation — doing so would disconnect
  // the calendar for the legitimate owner.
  let isConnectorOwner = false;
  try {
    await assertCalendarOwnership(req.user!.email, existing.provider as CalendarProvider);
    isConnectorOwner = true;
  } catch {
    // Non-owner or connector not configured — do not revoke.
  }

  await db
    .delete(calendarSourcesTable)
    .where(eq(calendarSourcesTable.id, id));

  if (isConnectorOwner) {
    await revokeProviderToken(existing.provider as CalendarProvider).catch(() => {});
  }

  res.json({ ok: true });
});

/* POST /api/calendar/sources/:id/sync — manual re-sync trigger. */
router.post("/sources/:id/sync", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const source = await db.query.calendarSourcesTable.findFirst({
    where: and(
      eq(calendarSourcesTable.id, id),
      eq(calendarSourcesTable.userId, userId),
    ),
  });
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  try {
    await syncSource(source);
    const refreshed = await db.query.calendarSourcesTable.findFirst({
      where: eq(calendarSourcesTable.id, id),
    });
    res.json({ source: serializeSource(refreshed ?? source) });
  } catch (err) {
    console.error("Manual calendar sync failed:", err);
    res.status(502).json({
      error: "Sync failed",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

/* GET /api/calendar/upcoming — events from now → +30 days. */
router.get("/upcoming", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.userId, userId),
        gte(calendarEventsTable.startsAt, now),
        lte(calendarEventsTable.startsAt, horizon),
      ),
    )
    .orderBy(calendarEventsTable.startsAt);

  res.json({
    events: rows.map((e) => ({
      id: e.id,
      sourceId: e.sourceId,
      title: e.title,
      location: e.location ?? null,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
    })),
  });
});

/* GET /api/calendar/prompts — events ended >=2h ago and still pending. */
router.get("/prompts", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const minStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.userId, userId),
        lt(calendarEventsTable.endsAt, cutoff),
        gt(calendarEventsTable.endsAt, minStart),
      ),
    )
    .orderBy(desc(calendarEventsTable.endsAt));

  const pending = rows.filter(
    (r) => r.promptStatus === "pending" || r.promptStatus === "shown",
  );

  res.json({
    prompts: pending.map((e) => {
      const durationHours =
        Math.round(((e.endsAt.getTime() - e.startsAt.getTime()) / (1000 * 60 * 60)) * 10) / 10;
      return {
        id: e.id,
        sourceId: e.sourceId,
        title: e.title,
        location: e.location ?? null,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        durationHours,
        status: e.promptStatus,
      };
    }),
  });
});

/* POST /api/calendar/prompts/:id — update prompt state (shown/dismissed/logged). */
router.post("/prompts/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid prompt id" });
    return;
  }
  const { action, recordId } = req.body ?? {};
  if (action !== "shown" && action !== "dismissed" && action !== "logged") {
    res.status(400).json({ error: "Invalid action" });
    return;
  }

  const existing = await db.query.calendarEventsTable.findFirst({
    where: and(
      eq(calendarEventsTable.id, id),
      eq(calendarEventsTable.userId, userId),
    ),
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const updates: Partial<typeof calendarEventsTable.$inferInsert> = {};
  if (action === "shown") {
    updates.promptStatus = "shown";
    updates.promptShownAt = new Date();
  } else if (action === "dismissed") {
    updates.promptStatus = "dismissed";
  } else if (action === "logged") {
    updates.promptStatus = "logged";
    updates.loggedAt = new Date();
    if (typeof recordId === "string") updates.loggedRecordId = recordId;
  }

  await db
    .update(calendarEventsTable)
    .set(updates)
    .where(eq(calendarEventsTable.id, id));

  res.json({ ok: true });
});

export default router;
