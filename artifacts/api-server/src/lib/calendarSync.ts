import { db, calendarSourcesTable, calendarEventsTable, type CalendarSource } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import {
  ConnectorNotConfiguredError,
  applyTitleFilter,
  fetchEventsForSource,
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
