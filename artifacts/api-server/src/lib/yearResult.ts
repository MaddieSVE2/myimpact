/**
 * A user's year as one impact result (the shape the PDF and share card use),
 * consistent with the recap total (routes/impact.ts aggregateYear).
 *
 * The recap subtracts double counts from the raw sums: per-activity impact
 * where an estimate and logged actuals overlap, donation overlap, the
 * excluded hours' contribution and personal-development value, and
 * report-share copies. Each comes off the matching part here; whatever a
 * report-share copy leaves over comes off donations, so the parts always add
 * up to the total.
 */
import { PERSONAL_DEV_RATE_PER_HOUR, VOLUNTEER_RATE } from "./contributionModel.js";

export interface YearActivity {
  activityId: string;
  activityName: string;
  category: string;
  sdg: string;
  sdgColor: string;
  impactValue: number;
  hours: number;
}

export interface YearAggregate {
  /** Reconciled totals (raw sums minus the recap's double counts). */
  totalValue: number;
  totalHours: number;
  /** Raw sums of each part, before reconciliation. */
  totalImpact: number;
  totalContribution: number;
  totalPersonalDevelopment: number;
  /** Already reconciled per activity / SDG. */
  activityMap: Map<string, YearActivity>;
  sdgMap: Map<string, { sdg: string; sdgColor: string; value: number }>;
  recon: { hoursExcess: number; activities: { excessValue: number }[] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function yearImpactResult(y: YearAggregate) {
  const impactExcess = y.recon.activities.reduce((s, a) => s + a.excessValue, 0);
  const impactValue = Math.max(0, round2(y.totalImpact - impactExcess));
  const contributionValue = Math.max(0, round2(y.totalContribution - y.recon.hoursExcess * VOLUNTEER_RATE));
  const personalDevelopmentValue = Math.max(0, round2(y.totalPersonalDevelopment - y.recon.hoursExcess * PERSONAL_DEV_RATE_PER_HOUR));
  const totalValue = Math.max(0, round2(y.totalValue));
  const donationsValue = Math.max(0, round2(totalValue - impactValue - contributionValue - personalDevelopmentValue));
  return {
    totalValue,
    impactValue,
    contributionValue,
    donationsValue,
    personalDevelopmentValue,
    totalHours: Math.max(0, round2(y.totalHours)),
    activityBreakdowns: Array.from(y.activityMap.values())
      .map((a) => ({ ...a, impactValue: round2(a.impactValue), hours: round2(a.hours) }))
      .filter((a) => a.impactValue > 0 || a.hours > 0)
      .sort((a, b) => b.impactValue - a.impactValue),
    sdgBreakdowns: Array.from(y.sdgMap.values())
      .map((s) => ({ ...s, value: round2(s.value) }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value),
  };
}
