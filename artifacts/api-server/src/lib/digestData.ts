import { db, impactRecordsTable, journalEntriesTable, orgMembersTable } from "@workspace/db";
import { and, eq, gte, lt, desc } from "drizzle-orm";
import { ACTIVITIES } from "./impactData.js";
import { computeBadges } from "./badges.js";

export interface MonthlyDigestPayload {
  monthLabel: string;
  hasActivityThisMonth: boolean;
  totals: {
    totalValue: number;
    impactValue: number;
    contributionValue: number;
    donationsValue: number;
    personalDevelopmentValue: number;
    totalHours: number;
    recordCount: number;
  };
  topActivity: { name: string; value: number } | null;
  topSdg: { name: string; color: string; value: number } | null;
  newMilestones: Array<{ name: string; emoji: string; description: string }>;
  journalHighlight: { reflection: string; periodLabel: string | null } | null;
  cumulative: {
    totalValue: number;
    totalHours: number;
    recordCount: number;
  };
}

interface ActivityBreakdown {
  activityId?: string;
  activityName?: string;
  category?: string;
  sdg?: string | number;
  sdgColor?: string;
  impactValue?: number;
  hours?: number;
}

const SDG_NAMES: Record<string, string> = {
  "1": "No Poverty",
  "2": "Zero Hunger",
  "3": "Good Health & Well-being",
  "4": "Quality Education",
  "5": "Gender Equality",
  "6": "Clean Water & Sanitation",
  "7": "Affordable & Clean Energy",
  "8": "Decent Work & Economic Growth",
  "9": "Industry, Innovation & Infrastructure",
  "10": "Reduced Inequalities",
  "11": "Sustainable Cities & Communities",
  "12": "Responsible Consumption & Production",
  "13": "Climate Action",
  "14": "Life Below Water",
  "15": "Life on Land",
  "16": "Peace, Justice & Strong Institutions",
  "17": "Partnerships for the Goals",
};

function sdgLabel(key: string): string {
  const named = SDG_NAMES[key];
  if (named) return `SDG ${key}: ${named}`;
  // Already a descriptive label
  return key;
}

interface ResultJsonShape {
  totalValue?: number;
  impactValue?: number;
  contributionValue?: number;
  donationsValue?: number;
  personalDevelopmentValue?: number;
  totalHours?: number;
  activityBreakdowns?: ActivityBreakdown[];
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Compute the [start, end) window for the calendar month immediately
 * preceding `now` in UTC. If `now` is 1 May 2026 02:00 UTC, returns
 * [1 Apr 2026 00:00 UTC, 1 May 2026 00:00 UTC).
 */
export function previousMonthRange(now: Date = new Date()): {
  start: Date;
  end: Date;
  monthLabel: string;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11, current month
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const monthLabel = start.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start, end, monthLabel };
}

/**
 * Build the monthly digest payload for a single user covering [start, end).
 * Returns `hasActivityThisMonth = false` when the user logged no impact
 * records in the window — callers may use that to skip sending.
 */
export async function buildMonthlyDigest(
  userId: string,
  start: Date,
  end: Date,
  monthLabel: string,
): Promise<MonthlyDigestPayload> {
  // ─── Records this month ───
  const monthRecords = await db
    .select()
    .from(impactRecordsTable)
    .where(
      and(
        eq(impactRecordsTable.userId, userId),
        gte(impactRecordsTable.createdAt, start),
        lt(impactRecordsTable.createdAt, end),
      ),
    );

  // ─── All records (for cumulative + milestone diffing) ───
  const allRecords = await db
    .select()
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId));

  const beforeRecords = allRecords.filter((r) => r.createdAt < start);

  // ─── Totals for the month ───
  const totals = {
    totalValue: 0,
    impactValue: 0,
    contributionValue: 0,
    donationsValue: 0,
    personalDevelopmentValue: 0,
    totalHours: 0,
    recordCount: monthRecords.length,
  };
  const activityValueMap = new Map<string, number>();
  const activityNameMap = new Map<string, string>();
  const sdgValueMap = new Map<string, number>();
  const sdgColorMap = new Map<string, string>();

  for (const r of monthRecords) {
    totals.totalValue += num(r.totalValue);
    totals.impactValue += num(r.impactValue);
    totals.contributionValue += num(r.contributionValue);
    totals.donationsValue += num(r.donationsValue);
    totals.personalDevelopmentValue += num(r.personalDevelopmentValue);
    totals.totalHours += num(r.totalHours);

    const result = (r.resultJson ?? {}) as ResultJsonShape;
    const breakdowns = Array.isArray(result.activityBreakdowns)
      ? result.activityBreakdowns
      : [];
    for (const b of breakdowns) {
      const value = num(b.impactValue);
      if (b.activityName && value > 0) {
        activityValueMap.set(
          b.activityName,
          (activityValueMap.get(b.activityName) ?? 0) + value,
        );
        activityNameMap.set(b.activityName, b.activityName);
      }
      if (b.sdg !== undefined && b.sdg !== null && value > 0) {
        const sdgKey = String(b.sdg);
        sdgValueMap.set(sdgKey, (sdgValueMap.get(sdgKey) ?? 0) + value);
        if (b.sdgColor) sdgColorMap.set(sdgKey, b.sdgColor);
      }
    }
  }

  // Round totals to 2dp for display.
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
    if (k === "recordCount") continue;
    const v = totals[k] as number;
    (totals[k] as number) = Math.round(v * 100) / 100;
  }

  let topActivity: MonthlyDigestPayload["topActivity"] = null;
  if (activityValueMap.size) {
    const [name, value] = [...activityValueMap.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]!;
    topActivity = { name, value: Math.round(value * 100) / 100 };
  }

  let topSdg: MonthlyDigestPayload["topSdg"] = null;
  if (sdgValueMap.size) {
    const [key, value] = [...sdgValueMap.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]!;
    topSdg = {
      name: sdgLabel(key),
      color: sdgColorMap.get(key) ?? "#F06127",
      value: Math.round(value * 100) / 100,
    };
  }

  // ─── Milestones earned this month (diff before vs after) ───
  const isOrgMember = !!(await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  }));

  const newMilestones = monthRecords.length
    ? diffEarnedBadges(beforeRecords, allRecords, isOrgMember)
    : [];

  // ─── Journal highlight (latest reflection text inside the window) ───
  const recentJournal = await db
    .select()
    .from(journalEntriesTable)
    .where(
      and(
        eq(journalEntriesTable.userId, userId),
        gte(journalEntriesTable.createdAt, start),
        lt(journalEntriesTable.createdAt, end),
      ),
    )
    .orderBy(desc(journalEntriesTable.createdAt));

  let journalHighlight: MonthlyDigestPayload["journalHighlight"] = null;
  for (const e of recentJournal) {
    const reflection = (e.reflectionText ?? e.text ?? "").trim();
    if (reflection.length > 0) {
      journalHighlight = {
        reflection: reflection.length > 280 ? reflection.slice(0, 277) + "…" : reflection,
        periodLabel: e.periodLabel,
      };
      break;
    }
  }

  const cumulative = {
    totalValue: Math.round(allRecords.reduce((s, r) => s + num(r.totalValue), 0) * 100) / 100,
    totalHours: Math.round(allRecords.reduce((s, r) => s + num(r.totalHours), 0) * 100) / 100,
    recordCount: allRecords.length,
  };

  return {
    monthLabel,
    hasActivityThisMonth: monthRecords.length > 0,
    totals,
    topActivity,
    topSdg,
    newMilestones,
    journalHighlight,
    cumulative,
  };
}

/**
 * Compute badges earned across the full history vs. badges earned with
 * only "before this month" history, and return the names of any newly
 * earned badges. The badge engine lives in the frontend, so we mirror
 * it on the server (see lib/badges.ts).
 */
function diffEarnedBadges(
  beforeRecords: typeof impactRecordsTable.$inferSelect[],
  allRecords: typeof impactRecordsTable.$inferSelect[],
  isOrgMember: boolean,
): Array<{ name: string; emoji: string; description: string }> {
  const beforeBadges = computeBadges(buildBadgeInput(beforeRecords, isOrgMember));
  const allBadges = computeBadges(buildBadgeInput(allRecords, isOrgMember));
  const beforeIds = new Set(beforeBadges.filter((b) => b.earned).map((b) => b.id));
  const newlyEarned = allBadges.filter((b) => b.earned && !beforeIds.has(b.id));
  return newlyEarned.map((b) => ({
    name: b.name,
    emoji: b.emoji,
    description: b.description,
  }));
}

function buildBadgeInput(
  records: typeof impactRecordsTable.$inferSelect[],
  isOrgMember: boolean,
) {
  const activityBreakdowns: Array<{ category: string; activityId?: string }> = [];
  const sdgIds: string[] = [];
  const recordDates: string[] = [];
  const monthlyRecordCounts: Record<string, number> = {};
  let totalValue = 0;
  let cumulativeHours = 0;
  let cumulativeDonations = 0;
  let cumulativePeopleSupported = 0; // we don't track this explicitly — leave 0

  for (const r of records) {
    totalValue += num(r.totalValue);
    cumulativeHours += num(r.totalHours);
    cumulativeDonations += num(r.donationsValue);
    const result = (r.resultJson ?? {}) as ResultJsonShape;
    for (const b of result.activityBreakdowns ?? []) {
      activityBreakdowns.push({
        category: b.category ?? "",
        activityId: b.activityId,
      });
      if (b.activityId) {
        const meta = ACTIVITIES.find((a) => a.id === b.activityId);
        if (meta) sdgIds.push(meta.sdg);
      }
    }
    recordDates.push(r.createdAt.toISOString());
    const k = `${r.createdAt.getUTCFullYear()}-${String(r.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyRecordCounts[k] = (monthlyRecordCounts[k] ?? 0) + 1;
  }

  return {
    totalValue,
    activityBreakdowns,
    isFirstRecord: records.length === 1,
    cumulativeHours,
    cumulativeDonations,
    cumulativePeopleSupported,
    monthlyRecordCounts,
    recordDates,
    isOrgMember,
    accountAgeDays: 0,
    sdgIds,
  };
}
