/**
 * Reads the signed-in person's saved impact record for Sidekick and cuts it
 * down to a few bounded facts: total social value, total hours and their
 * main activities with hours.
 *
 * The figures come from the database through the same aggregation the recap
 * and History use (recordAggregation.ts), never from the browser. Journal
 * entries, notes and reflections are not read here at all.
 *
 * Nothing is read for an anonymous caller, or for a manager speaking for
 * their organisation: organisation requests carry no personal data.
 */
import { aggregateLifetime, aggregateYear } from "./recordAggregation.js";
import {
  isOrgManagerContext,
  type SidekickChatContext,
  type SidekickSavedActivity,
  type SidekickSavedRecord,
} from "./sidekickContext.js";

/** Most activities listed. The rest are only counted. */
export const MAX_SAVED_RECORD_ACTIVITIES = 8;
/** Activities in a person's own words can be any length, so names are cut. */
export const MAX_SAVED_ACTIVITY_NAME_CHARS = 60;

/** The parts of the shared aggregation the summary is built from. */
export interface SavedRecordAggregates {
  lifetime: {
    records: { entryDate: Date }[];
    totalValue: number;
    totalHours: number;
    activityMap: Map<string, { activityName: string; impactValue: number; hours: number }>;
  };
  thisYear: { totalValue: number; totalHours: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const figure = (n: number) => (Number.isFinite(n) ? Math.max(0, round2(n)) : 0);

/** Single-line plain text, cut to length, safe inside a system message. */
function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > MAX_SAVED_ACTIVITY_NAME_CHARS
    ? `${cleaned.slice(0, MAX_SAVED_ACTIVITY_NAME_CHARS - 1).trimEnd()}…`
    : cleaned;
}

function monthAndYear(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Turns the aggregated record into the bounded summary Sidekick is given.
 * Totals are rounded the same way as the recap and the yearly result.
 */
export function summariseSavedRecord(aggregates: SavedRecordAggregates, year: number): SidekickSavedRecord {
  const { lifetime, thisYear } = aggregates;
  if (lifetime.records.length === 0) return { status: "empty" };

  // Same filter and order as the yearly result (yearResult.ts): activities
  // with something counted, highest social value first.
  const ranked = Array.from(lifetime.activityMap.values())
    .map((a) => ({ name: cleanName(a.activityName), impactValue: round2(a.impactValue), hours: round2(a.hours) }))
    .filter((a) => a.name.length > 0 && (a.impactValue > 0 || a.hours > 0))
    .sort((a, b) => b.impactValue - a.impactValue);
  const activities: SidekickSavedActivity[] = ranked
    .slice(0, MAX_SAVED_RECORD_ACTIVITIES)
    .map((a) => ({ name: a.name, hours: Math.max(0, a.hours) }));

  const times = lifetime.records
    .map((r) => r.entryDate.getTime())
    .filter((t) => Number.isFinite(t));

  return {
    status: "saved",
    totalValue: figure(lifetime.totalValue),
    totalHours: figure(lifetime.totalHours),
    year,
    yearValue: figure(thisYear.totalValue),
    yearHours: figure(thisYear.totalHours),
    activities,
    moreActivities: ranked.length - activities.length,
    firstEntry: times.length > 0 ? monthAndYear(new Date(Math.min(...times))) : null,
    latestEntry: times.length > 0 ? monthAndYear(new Date(Math.max(...times))) : null,
  };
}

/** Reads the person's totals from the database. */
async function loadAggregatesFromDatabase(userId: string, year: number): Promise<SavedRecordAggregates> {
  const lifetime = await aggregateLifetime(userId);
  // Nothing saved means nothing this year either: skip the second read.
  if (lifetime.records.length === 0) return { lifetime, thisYear: { totalValue: 0, totalHours: 0 } };
  return { lifetime, thisYear: await aggregateYear(userId, year) };
}

export interface SavedRecordRequest {
  /** The signed-in caller, from the session. Absent for anonymous callers. */
  userId: string | null | undefined;
  /** The context the browser sent, used only to tell organisation mode. */
  context: SidekickChatContext | null | undefined;
  now?: Date;
  /** Replaceable in tests. Defaults to reading the database. */
  load?: (userId: string, year: number) => Promise<SavedRecordAggregates>;
}

/**
 * The saved record to give Sidekick for this request, or null when none
 * applies. Never throws: if the record cannot be read the chat still works
 * and Sidekick is told the record was unavailable.
 */
export async function loadSidekickSavedRecord(request: SavedRecordRequest): Promise<SidekickSavedRecord | null> {
  const { userId, context } = request;
  // Anonymous callers have no record: they get exactly what they got before.
  if (!userId) return null;
  // A manager speaking for their organisation: nothing about their own
  // record is read, so nothing personal can reach an organisation reply.
  if (isOrgManagerContext(context)) return null;

  const year = (request.now ?? new Date()).getUTCFullYear();
  try {
    const aggregates = await (request.load ?? loadAggregatesFromDatabase)(userId, year);
    return summariseSavedRecord(aggregates, year);
  } catch (err) {
    console.error("[sidekick] could not read the saved record:", err);
    return { status: "unavailable" };
  }
}
