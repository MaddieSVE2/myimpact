import { describe, it, expect } from "vitest";
import { yearImpactResult, type YearAggregate } from "../src/lib/yearResult.js";

const activity = (activityId: string, impactValue: number, hours: number) => ({
  activityId, activityName: activityId, category: "Community", sdg: "SDG 3", sdgColor: "#4C9F38", impactValue, hours,
});
const parts = (r: ReturnType<typeof yearImpactResult>) =>
  Math.round((r.impactValue + r.contributionValue + r.donationsValue + r.personalDevelopmentValue) * 100) / 100;

describe("yearImpactResult", () => {
  it("adds up a year with no overlaps", () => {
    // Two entries: impact 100 + 50, contribution 24.42 + 12.21, PD 30 + 15, donations 20.
    const y: YearAggregate = {
      totalValue: 251.63,
      totalHours: 3,
      totalImpact: 150,
      totalContribution: 36.63,
      totalPersonalDevelopment: 45,
      activityMap: new Map([["coaching", activity("coaching", 150, 3)]]),
      sdgMap: new Map([["SDG 3", { sdg: "SDG 3", sdgColor: "#4C9F38", value: 150 }]]),
      recon: { hoursExcess: 0, activities: [] },
    };
    const r = yearImpactResult(y);
    expect(r).toMatchObject({ totalValue: 251.63, impactValue: 150, contributionValue: 36.63, personalDevelopmentValue: 45, donationsValue: 20, totalHours: 3 });
    expect(parts(r)).toBe(r.totalValue);
  });

  it("takes estimate-vs-logged overlaps off the matching parts and still adds up", () => {
    // Raw: impact 300, 4h (contribution 48.84, PD 60), donations 10 → 418.84.
    // Overlap: 100 impact and 2h counted twice → value excess 100 + 2 × (12.21 + 15) = 154.42.
    const y: YearAggregate = {
      totalValue: 418.84 - 154.42,
      totalHours: 2,
      totalImpact: 300,
      totalContribution: 48.84,
      totalPersonalDevelopment: 60,
      activityMap: new Map([["coaching", activity("coaching", 200, 2)]]),
      sdgMap: new Map(),
      recon: { hoursExcess: 2, activities: [{ excessValue: 100 }] },
    };
    const r = yearImpactResult(y);
    expect(r.impactValue).toBe(200);
    expect(r.contributionValue).toBe(24.42);
    expect(r.personalDevelopmentValue).toBe(30);
    expect(r.donationsValue).toBe(10);
    expect(parts(r)).toBe(r.totalValue);
  });

  it("takes a report-share copy's leftover off donations so the parts add up", () => {
    // A shared copy's donation (£15) is in the value excess but not in any part's excess.
    const y: YearAggregate = {
      totalValue: 100 + 15 - 15,
      totalHours: 0,
      totalImpact: 100,
      totalContribution: 0,
      totalPersonalDevelopment: 0,
      activityMap: new Map(),
      sdgMap: new Map(),
      recon: { hoursExcess: 0, activities: [] },
    };
    const r = yearImpactResult(y);
    expect(r.donationsValue).toBe(0);
    expect(parts(r)).toBe(r.totalValue);
  });

  it("never reports negative parts, and drops empty activities and SDGs", () => {
    const y: YearAggregate = {
      totalValue: 0,
      totalHours: 0,
      totalImpact: 0,
      totalContribution: 0,
      totalPersonalDevelopment: 0,
      activityMap: new Map([["gone", activity("gone", 0, 0)]]),
      sdgMap: new Map([["SDG 1", { sdg: "SDG 1", sdgColor: "#000", value: 0 }]]),
      recon: { hoursExcess: 1, activities: [{ excessValue: 5 }] },
    };
    const r = yearImpactResult(y);
    expect(Math.min(r.impactValue, r.contributionValue, r.personalDevelopmentValue, r.donationsValue)).toBeGreaterThanOrEqual(0);
    expect(r.activityBreakdowns).toEqual([]);
    expect(r.sdgBreakdowns).toEqual([]);
  });
});
