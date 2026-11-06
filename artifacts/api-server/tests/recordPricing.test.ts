import { describe, it, expect } from "vitest";
import { calculateImpact, pricingFromResult } from "../src/lib/impactData.js";

const line = (activityId: string, quantity: number, hoursPerYear: number) => ({ activityId, quantity, hoursPerYear });

/** A result as it was saved before November 2026's values. */
const savedBefore = {
  totalValue: 8040 + 2220 + 14 * 12.21 + 14 * 15,
  totalHours: 14,
  impactValue: 8040 + 2220,
  contributionValue: 14 * 12.21,
  donationsValue: 0,
  personalDevelopmentValue: 14 * 15,
  activityBreakdowns: [
    { activityId: "befriending", impactValue: 8040, hours: 2, quantity: 1, valuePerUnit: 8040, unit: "person", unitLabel: "people", proxy: "Reduced social isolation", proxyYear: "2021" },
    { activityId: "food_bank", impactValue: 2220, hours: 12, quantity: 12, valuePerUnit: 185, unit: "session", unitLabel: "sessions", proxy: "Value of being supported by a food bank", proxyYear: "2018" },
  ],
};

describe("valuing with a saved entry's values", () => {
  it("reads the National Living Wage and each activity's value from the saved result", () => {
    const pricing = pricingFromResult(savedBefore);
    expect(pricing.volunteerRate).toBe(12.21);
    expect(pricing.activities.get("food_bank")).toMatchObject({ valuePerUnit: 185, unit: "session" });
  });

  it("values the same activities exactly as they were saved", () => {
    const r = calculateImpact([line("befriending", 1, 2), line("food_bank", 12, 12)], 0, 0, [], { pricing: pricingFromResult(savedBefore) });
    expect(r.totalValue).toBeCloseTo(savedBefore.totalValue, 6);
    expect(r.activityBreakdowns.find((b) => b.activityId === "food_bank")).toMatchObject({ impactValue: 2220, unit: "session", proxy: "Value of being supported by a food bank" });
  });

  it("values a share of part of the entry the same way", () => {
    const r = calculateImpact([line("food_bank", 12, 12)], 0, 0, [], { pricing: pricingFromResult(savedBefore) });
    expect(r.impactValue).toBe(2220);
    expect(r.contributionValue).toBeCloseTo(12 * 12.21, 6);
  });

  it("uses today's values without saved ones", () => {
    const r = calculateImpact([line("food_bank", 12, 36)], 0, 0, []);
    expect(r.activityBreakdowns[0]).toMatchObject({ impactValue: 36 * 15, unit: "hour" });
    expect(r.contributionValue).toBeCloseTo(36 * 12.71, 6);
  });

  it("falls back to today's values for activities the saved result doesn't price", () => {
    const pricing = pricingFromResult({ totalHours: 0, activityBreakdowns: [{ activityId: "tree_planting", impactValue: 5975 }] });
    expect(pricing.activities.size).toBe(0);
    expect(calculateImpact([line("tree_planting", 5, 0)], 0, 0, [], { pricing }).impactValue).toBe(5 * 1060);
  });
});
