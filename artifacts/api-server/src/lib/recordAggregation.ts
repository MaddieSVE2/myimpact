/**
 * Adds up one person's saved impact records.
 *
 * This is the single place a person's own totals are worked out, so the
 * recap, History, the yearly report and Sidekick cannot disagree: raw sums
 * of the saved results, minus the estimate-versus-actual and report-share
 * double counts (see computeEstimateActualReconciliation).
 */
import { db, impactRecordsTable } from "@workspace/db";
import { and, desc, eq, gte, isNotNull, lt, or, type SQL } from "drizzle-orm";
import {
  computeEstimateActualReconciliation,
  type ReconciliationResult,
} from "./contributionModel.js";

export type ImpactRecordRow = typeof impactRecordsTable.$inferSelect;

export function startOfYearUTC(year: number): Date {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0));
}

// Exclusive upper bound for calendar-year queries: midnight on Jan 1 of the
// next year. All year filters must use this as a strict `<` so that an entry
// dated 1 Jan of the following year never leaks back into the prior year's
// totals.
export function endOfYearUTC(year: number): Date {
  return new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
}

/**
 * Annual estimates whose authoritative report period overlaps the given
 * window but whose entryDate falls OUTSIDE it (e.g. an academic-year report
 * homed in the prior calendar year). Appending these to a windowed
 * reconciliation input lets quick logs inside the window reconcile against
 * the cross-year estimate; their values are NEVER added to the window's raw
 * sums, so each estimate still counts in exactly one calendar year while the
 * activity itself is counted once across years. Legacy rows have NULL period
 * fields and are never returned — historical aggregates stay byte-identical.
 */
export async function fetchOverlappingPeriodEstimates(
  scope: string | SQL,
  windowStart: Date,
  windowEndExclusive: Date,
): Promise<ImpactRecordRow[]> {
  // `scope` is either a personal user id or an arbitrary base condition
  // (e.g. an org's shared-records condition), so personal dashboards and org
  // stats reconcile cross-window periods with identical logic.
  const scopeCondition = typeof scope === "string" ? eq(impactRecordsTable.userId, scope) : scope;
  // ALL estimates whose period overlaps the window — including ones homed
  // inside it (already in the caller's rows): their in-period quick logs
  // outside the window must still join as capacity-consuming context.
  const estimates = await db
    .select()
    .from(impactRecordsTable)
    .where(
      and(
        scopeCondition,
        eq(impactRecordsTable.kind, "annual_estimate"),
        isNotNull(impactRecordsTable.reportStartDate),
        isNotNull(impactRecordsTable.reportEndDate),
        lt(impactRecordsTable.reportStartDate, windowEndExclusive),
        gte(impactRecordsTable.reportEndDate, windowStart),
      ),
    );
  if (estimates.length === 0) return [];
  const outOfWindowEstimates = estimates.filter(
    (e) => e.entryDate < windowStart || e.entryDate >= windowEndExclusive,
  );

  // The estimates' in-period quick logs OUTSIDE the window must also join
  // the reconciliation input as context: they consume the estimates'
  // capacity first (chronological order), so a windowed caller can never
  // reuse capacity another calendar year has already absorbed.
  const minStart = new Date(Math.min(...estimates.map((e) => e.reportStartDate!.getTime())));
  // Inclusive period end → exclusive upper bound one day later.
  const maxEndExclusive = new Date(Math.max(...estimates.map((e) => e.reportEndDate!.getTime())) + 86_400_000);
  const contextLogs = await db
    .select()
    .from(impactRecordsTable)
    .where(
      and(
        scopeCondition,
        eq(impactRecordsTable.kind, "quick_log"),
        gte(impactRecordsTable.entryDate, minStart),
        lt(impactRecordsTable.entryDate, maxEndExclusive),
        or(
          lt(impactRecordsTable.entryDate, windowStart),
          gte(impactRecordsTable.entryDate, windowEndExclusive),
        ),
      ),
    );
  return [...outOfWindowEstimates, ...contextLogs];
}

interface RecapBreakdownEntry {
  activityId?: string;
  activityName?: string;
  category?: string;
  sdg?: string;
  sdgColor?: string;
  impactValue?: number;
  hours?: number;
}

interface RecapResultJson {
  totalValue?: number;
  totalHours?: number;
  donationsValue?: number;
  impactValue?: number;
  contributionValue?: number;
  personalDevelopmentValue?: number;
  activityBreakdowns?: RecapBreakdownEntry[];
}

export function parseRecapResult(raw: unknown): RecapResultJson {
  if (raw === null || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    donationsValue: typeof r.donationsValue === "number" ? r.donationsValue : 0,
    impactValue: typeof r.impactValue === "number" ? r.impactValue : 0,
    contributionValue: typeof r.contributionValue === "number" ? r.contributionValue : 0,
    personalDevelopmentValue: typeof r.personalDevelopmentValue === "number" ? r.personalDevelopmentValue : 0,
    activityBreakdowns: Array.isArray(r.activityBreakdowns) ? (r.activityBreakdowns as RecapBreakdownEntry[]) : [],
  };
}

/**
 * Sums a set of records and takes off the double counts in `recon`, which
 * must have been computed for the same set (see aggregateYear and
 * aggregateLifetime for the two ways that is done).
 */
export function aggregateRecords(records: ImpactRecordRow[], recon: ReconciliationResult) {
  let totalValue = 0;
  let totalHours = 0;
  let totalDonations = 0;
  let totalImpact = 0;
  let totalContribution = 0;
  let totalPersonalDevelopment = 0;

  const activityMap = new Map<string, { activityId: string; activityName: string; category: string; sdg: string; sdgColor: string; impactValue: number; hours: number }>();
  const sdgMap = new Map<string, { sdg: string; sdgColor: string; value: number }>();
  const categories = new Set<string>();

  let biggestSession: { recordId: string; name: string; period: string | null; totalValue: number; totalHours: number; createdAt: string } | null = null;

  for (const r of records) {
    const result = parseRecapResult(r.resultJson);
    const rTotal = result.totalValue ?? 0;
    const rHours = result.totalHours ?? 0;
    totalValue += rTotal;
    totalHours += rHours;
    totalDonations += result.donationsValue ?? 0;
    totalImpact += result.impactValue ?? 0;
    totalContribution += result.contributionValue ?? 0;
    totalPersonalDevelopment += result.personalDevelopmentValue ?? 0;

    if (!biggestSession || rTotal > biggestSession.totalValue) {
      biggestSession = {
        recordId: String(r.id),
        name: r.name,
        period: r.periodLabel ?? null,
        totalValue: Math.round(rTotal * 100) / 100,
        totalHours: rHours,
        createdAt: r.createdAt.toISOString(),
      };
    }

    for (const b of result.activityBreakdowns ?? []) {
      const aId = b.activityId ?? b.activityName ?? "unknown";
      const aName = b.activityName ?? aId;
      const cat = b.category ?? "Other";
      const sdg = b.sdg ?? "";
      const sdgColor = b.sdgColor ?? "#999";
      const impactValue = typeof b.impactValue === "number" ? b.impactValue : 0;
      const hours = typeof b.hours === "number" ? b.hours : 0;

      if (cat) categories.add(cat);

      const existing = activityMap.get(aId);
      if (existing) {
        existing.impactValue += impactValue;
        existing.hours += hours;
      } else {
        activityMap.set(aId, {
          activityId: aId,
          activityName: aName,
          category: cat,
          sdg,
          sdgColor,
          impactValue,
          hours,
        });
      }

      if (sdg) {
        const sdgEntry = sdgMap.get(sdg);
        if (sdgEntry) {
          sdgEntry.value += impactValue;
        } else {
          sdgMap.set(sdg, { sdg, sdgColor, value: impactValue });
        }
      }
    }
  }

  // Estimate-vs-actual reconciliation: when the set mixes an annual
  // estimate and quick-logged actuals for the same activity, the headline
  // counts each such activity once (the greater of the two). All-legacy
  // sets get a zero adjustment, so their totals are the raw sums.
  totalValue -= recon.valueExcess;
  totalHours -= recon.hoursExcess;
  totalDonations -= recon.donationExcess;
  for (const a of recon.activities) {
    const entry = activityMap.get(a.activityId);
    if (entry) {
      entry.impactValue -= a.excessValue;
      entry.hours -= a.excessHours;
    }
    if (a.sdg) {
      const sdgEntry = sdgMap.get(a.sdg);
      if (sdgEntry) sdgEntry.value -= a.excessValue;
    }
  }

  return {
    totalValue, totalHours, totalDonations,
    totalImpact, totalContribution, totalPersonalDevelopment,
    activityMap, sdgMap, categories, biggestSession, recon,
  };
}

/**
 * One user's calendar year, shared by the recap and the yearly report so
 * both show the same reconciled figures: raw sums of the year's records,
 * minus the estimate-vs-actual and report-share double counts.
 */
export async function aggregateYear(userId: string, yearParam: number) {
  const start = startOfYearUTC(yearParam);
  const end = endOfYearUTC(yearParam);

  const yearRecords = await db
    .select()
    .from(impactRecordsTable)
    .where(
      and(
        eq(impactRecordsTable.userId, userId),
        gte(impactRecordsTable.entryDate, start),
        lt(impactRecordsTable.entryDate, end),
      ),
    )
    .orderBy(desc(impactRecordsTable.entryDate));

  // Include cross-year estimates whose authoritative report period overlaps
  // this calendar year (recon input only — never the raw sums), so quick
  // logs here reconcile against e.g. an academic-year report homed in the
  // prior calendar year. The response carries per-activity
  // "Estimated: X / Logged so far: Y" detail from the same reconciliation.
  const overlappingEstimates = await fetchOverlappingPeriodEstimates(userId, start, end);
  const recon = computeEstimateActualReconciliation(
    [...yearRecords, ...overlappingEstimates],
    { window: { start, endExclusive: end } },
  );

  return { start, end, yearRecords, ...aggregateRecords(yearRecords, recon) };
}

/**
 * Everything one user has saved, across all years, with the same dedupe
 * rule as the yearly totals: estimate-vs-actual overlap and report-share
 * copies (a report plus its org share) count once.
 */
export async function aggregateLifetime(userId: string) {
  const records = await db
    .select()
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId))
    .orderBy(impactRecordsTable.createdAt);

  const recon = computeEstimateActualReconciliation(records);
  return { records, ...aggregateRecords(records, recon) };
}
