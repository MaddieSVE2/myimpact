// A saved impact result's totals, recomputed after some of its activity
// lines were corrected. Shared by the corrections that rewrite saved
// entries (lib/proxyRepair.ts, lib/customValueReview.ts).

import { contributionRate, PERSONAL_DEV_RATE_PER_HOUR } from "./contributionModel.js";

interface TotalledLine {
  sdg?: string;
  sdgColor?: string;
  impactValue?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The result with these activity lines and this many hours. Hours keep the
 * National Living Wage the entry was saved with, and donations are untouched.
 */
export function retotalResult(
  result: Record<string, unknown>,
  breakdowns: TotalledLine[],
  totalHours: number,
): Record<string, unknown> & {
  totalValue: number;
  impactValue: number;
  contributionValue: number;
  donationsValue: number;
  personalDevelopmentValue: number;
  totalHours: number;
} {
  const lineValue = (b: TotalledLine) => (typeof b.impactValue === "number" ? b.impactValue : 0);
  const impactValue = breakdowns.reduce((sum, b) => sum + lineValue(b), 0);
  const donationsValue = typeof result.donationsValue === "number" ? result.donationsValue : 0;
  const contributionValue = totalHours * contributionRate(result);
  const personalDevelopmentValue = totalHours * PERSONAL_DEV_RATE_PER_HOUR;
  const totalValue = impactValue + contributionValue + donationsValue + personalDevelopmentValue;

  const sdgMap = new Map<string, { sdg: string; sdgColor: string; value: number }>();
  for (const b of breakdowns) {
    const sdg = b.sdg ?? "Good Health and Well-Being";
    if (!sdgMap.has(sdg)) sdgMap.set(sdg, { sdg, sdgColor: b.sdgColor ?? "#4C9F38", value: 0 });
    sdgMap.get(sdg)!.value += lineValue(b);
  }

  return {
    ...result,
    activityBreakdowns: breakdowns,
    totalHours,
    impactValue: round2(impactValue),
    contributionValue: round2(contributionValue),
    donationsValue: round2(donationsValue),
    personalDevelopmentValue: round2(personalDevelopmentValue),
    totalValue: round2(totalValue),
    sdgBreakdowns: Array.from(sdgMap.values()).map((s) => ({ ...s, value: round2(s.value) })),
  };
}
