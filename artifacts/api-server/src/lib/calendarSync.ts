import { db, calendarSourcesTable, calendarEventsTable, usersTable, type CalendarSource } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import {
  assertCalendarOwnership,
  CalendarOwnershipError,
  ConnectorNotConfiguredError,
  applyTitleFilter,
  fetchEventsForSource,
  getPrimaryCalendar,
  type CalendarProvider,
} from "./calendarProviders.js";

const UPCOMING_WINDOW_DAYS = 30;
const LOOKBACK_HOURS = 24;

interface SyncSummary {
  sourceId: string;
  fetched: number;
  inserted: number;
  updated: number;
  removed: number;
}

/**
 * Sync a single calendar source: pull events in the window
 * [-LOOKBACK_HOURS, +UPCOMING_WINDOW_DAYS], apply the source's filter, and
 * upsert into the events cache. Removes cached future events that no longer
 * appear in the provider response so a deleted/cancelled event drops off.
 *
 * Past events that already have a prompt state (shown/dismissed/logged) are
 * preserved even if they fall out of the window.
 */
export async function syncSource(source: CalendarSource): Promise<SyncSummary> {
  if (source.status !== "active") {
    return { sourceId: source.id, fetched: 0, inserted: 0, updated: 0, removed: 0 };
  }
  if (!source.calendarId) {
    return { sourceId: source.id, fetched: 0, inserted: 0, updated: 0, removed: 0 };
  }

  // Security: verify that the source owner's application email matches the
  // connector account email BEFORE any event data is fetched. This closes the
  // residual exposure path for pre-existing sources that were created before
  // the ownership check was added: if a source was created by a non-owner user,
  // it is deactivated here and the sync is aborted rather than continuing to
  // stream connector calendar data into that user's event cache.
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, source.userId),
    });
    if (!user) {
      throw new Error(`User ${source.userId} not found for source ${source.id}`);
    }
    await assertCalendarOwnership(user.email, source.provider as CalendarProvider);
  } catch (err) {
    if (err instanceof CalendarOwnershipError) {
      console.warn(
        `syncSource: source ${source.id} belongs to user ${source.userId} who does not own ` +
        `the ${source.provider} connector. Deactivating source and purging cached events.`,
      );
      // Delete all cached events for this source before deactivating it so
      // that previously synced connector calendar data is no longer accessible
      // to the non-owner user via /upcoming or /prompts.
      await db
        .delete(calendarEventsTable)
        .where(
          and(
            eq(calendarEventsTable.sourceId, source.id),
            eq(calendarEventsTable.userId, source.userId),
          ),
        );
      await db
        .update(calendarSourcesTable)
        .set({
          status: "error",
          lastSyncError:
            "Deactivated: calendar ownership verification failed. " +
            "This connector belongs to a different account.",
          updatedAt: new Date(),
        })
        .where(eq(calendarSourcesTable.id, source.id));
      return { sourceId: source.id, fetched: 0, inserted: 0, updated: 0, removed: 0 };
    }
    // Any other error (network, DB): fail closed — mark error and abort.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(`syncSource: ownership check failed for source ${source.id}: ${message}`);
    await db
      .update(calendarSourcesTable)
      .set({
        lastSyncError: `Ownership check failed: ${message}`,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(calendarSourcesTable.id, source.id));
    throw new Error(`Ownership check failed for source ${source.id}: ${message}`);
  }

  // Security: verify the stored calendarId still matches the server-derived
  // primary calendar for this provider. This repairs or disables any source
  // whose calendarId was set to a non-primary (or unauthorized) value before
  // this guard was in place, preventing continued sync of arbitrary calendars
  // via the shared deployment-wide connector token.
  try {
    const { calendar: primary } = await getPrimaryCalendar(source.provider as CalendarProvider);
    if (source.calendarId !== primary.id) {
      console.warn(
        `syncSource: source ${source.id} has calendarId "${source.calendarId}" which does not match ` +
        `the connector's primary calendar "${primary.id}". Correcting to primary calendar.`,
      );
      await db
        .update(calendarSourcesTable)
        .set({
          calendarId: primary.id,
          calendarName: primary.name.slice(0, 200),
          lastSyncError: "Calendar corrected to primary; syncing from primary calendar now.",
          updatedAt: new Date(),
        })
        .where(eq(calendarSourcesTable.id, source.id));
      source = { ...source, calendarId: primary.id, calendarName: primary.name };
    }
  } catch (err) {
    // Fail closed: any error verifying the primary calendar — including
    // transient network issues — prevents the sync from proceeding with an
    // unverified calendarId. Mark the source with the error and abort.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(`syncSource: primary calendar verification failed for source ${source.id}: ${message}`);
    await db
      .update(calendarSourcesTable)
      .set({
        lastSyncError: `Calendar verification failed: ${message}`,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(calendarSourcesTable.id, source.id));
    throw err instanceof ConnectorNotConfiguredError
      ? err
      : new Error(`Calendar verification failed for source ${source.id}: ${message}`);
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let rawEvents;
  try {
    rawEvents = await fetchEventsForSource(
      source.provider as CalendarProvider,
      source.calendarId,
      timeMin,
      timeMax,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(calendarSourcesTable)
      .set({
        lastSyncError: message,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(calendarSourcesTable.id, source.id));
    if (err instanceof ConnectorNotConfiguredError) {
      throw err;
    }
    throw err;
  }

  const filtered = applyTitleFilter(rawEvents, source.filterText);
  const externalIds = new Set(filtered.map((e) => e.externalId));

  const existing = await db
    .select()
    .from(calendarEventsTable)
    .where(eq(calendarEventsTable.sourceId, source.id));
  const existingByExt = new Map(existing.map((e) => [e.externalId, e]));

  let inserted = 0;
  let updated = 0;
  for (const ev of filtered) {
    const prev = existingByExt.get(ev.externalId);
    if (!prev) {
      await db.insert(calendarEventsTable).values({
        sourceId: source.id,
        userId: source.userId,
        externalId: ev.externalId,
        title: ev.title.slice(0, 500),
        location: ev.location?.slice(0, 500) ?? null,
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        lastSyncedAt: new Date(),
      });
      inserted++;
    } else {
      const titleChanged = prev.title !== ev.title.slice(0, 500);
      const locChanged = (prev.location ?? null) !== (ev.location?.slice(0, 500) ?? null);
      const startChanged = prev.startsAt.getTime() !== ev.startsAt.getTime();
      const endChanged = prev.endsAt.getTime() !== ev.endsAt.getTime();
      if (titleChanged || locChanged || startChanged || endChanged) {
        await db
          .update(calendarEventsTable)
          .set({
            title: ev.title.slice(0, 500),
            location: ev.location?.slice(0, 500) ?? null,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            lastSyncedAt: new Date(),
          })
          .where(eq(calendarEventsTable.id, prev.id));
        updated++;
      } else {
        await db
          .update(calendarEventsTable)
          .set({ lastSyncedAt: new Date() })
          .where(eq(calendarEventsTable.id, prev.id));
      }
    }
  }

  // Remove future cached events that no longer appear in provider response.
  // Keep past events with a prompt state so we don't drop pending prompts.
  let removed = 0;
  const futureGone = existing.filter(
    (e) => e.startsAt > now && !externalIds.has(e.externalId),
  );
  for (const e of futureGone) {
    await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, e.id));
    removed++;
  }

  await db
    .update(calendarSourcesTable)
    .set({
      lastSyncedAt: new Date(),
      lastSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(calendarSourcesTable.id, source.id));

  return { sourceId: source.id, fetched: filtered.length, inserted, updated, removed };
}

/**
 * Sync every active source. Used by the scheduled worker.
 */
export async function syncAllSources(): Promise<SyncSummary[]> {
  const sources = await db
    .select()
    .from(calendarSourcesTable)
    .where(eq(calendarSourcesTable.status, "active"));

  const summaries: SyncSummary[] = [];
  for (const s of sources) {
    try {
      summaries.push(await syncSource(s));
    } catch (err) {
      console.error(`Sync failed for source ${s.id}:`, err);
      summaries.push({ sourceId: s.id, fetched: 0, inserted: 0, updated: 0, removed: 0 });
    }
  }
  return summaries;
}

/**
 * Garbage-collect very old cached events to keep the table small.
 */
export async function pruneOldEvents(daysToKeep = 60): Promise<number> {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(calendarEventsTable)
    .where(lt(calendarEventsTable.endsAt, cutoff))
    .returning({ id: calendarEventsTable.id });
  return deleted.length;
}
