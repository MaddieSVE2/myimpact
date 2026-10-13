import { describe, expect, it } from "vitest";
import { calcResultBreakdown, detectInflatedDonations, repairLocalInflatedDonations } from "./formula";

describe("calcResultBreakdown", () => {
  it("shows hours at the hourly rate", () => {
    expect(calcResultBreakdown({ unit: "hour", valuePerUnit: 14.43, hours: 48, impactValue: 692.64 })).toBe("48 hrs × £14.43/hr");
  });

  it("shows money pound for pound as a yearly amount", () => {
    expect(calcResultBreakdown({ unit: "pound", valuePerUnit: 1, quantity: 1200, hours: 0, impactValue: 1200 })).toBe("£1,200/year");
  });

  it("names a single unit for other quantities", () => {
    expect(calcResultBreakdown({ unit: "item", unitLabel: "people helped", valuePerUnit: 50, quantity: 3, hours: 0, impactValue: 150 })).toBe(
      "3 people helped × £50/person",
    );
    expect(calcResultBreakdown({ unit: "item", unitLabel: "meals", valuePerUnit: 2.5, hours: 0, impactValue: 25 })).toBe("10 meals × £2.50/meal");
  });

  it("is empty for entries saved without a rate", () => {
    expect(calcResultBreakdown({ hours: 10, impactValue: 100 })).toBe("");
  });
});

// A signed-out result saved before the donation fix: "donate £6 a week" was
// matched to a weekly proxy and valued at £3,456 instead of £312 a year.
function inflatedResult() {
  return {
    activityBreakdowns: [
      { activityId: "custom_1", activityName: "Donate £6 a week to charity", category: "Custom", impactValue: 3456, hours: 10, unit: "item", valuePerUnit: 66.46, sdg: "No Poverty", sdgColor: "#E5243B" },
      { activityId: "litter_picking", activityName: "Litter picking", category: "Environment", impactValue: 100, hours: 20, unit: "hour", valuePerUnit: 5, sdg: "Life on Land", sdgColor: "#56C02B" },
    ],
    totalHours: 30,
    impactValue: 3556,
    contributionValue: 30 * 12.21,
    donationsValue: 40,
    personalDevelopmentValue: 30 * 15,
    totalValue: 3556 + 30 * 12.21 + 40 + 30 * 15,
  };
}

describe("detectInflatedDonations", () => {
  it("measures how far a donation line is overstated", () => {
    expect(detectInflatedDonations(inflatedResult())).toBe(3456 - 312);
  });

  it("leaves fundraising, pound-for-pound lines and fair values alone", () => {
    const result = inflatedResult();
    result.activityBreakdowns[0] = { ...result.activityBreakdowns[0]!, activityName: "Fundraising: raised £6 a week" };
    expect(detectInflatedDonations(result)).toBe(0);
    expect(detectInflatedDonations({ activityBreakdowns: [{ activityName: "Gave £300 a year", category: "Custom", unit: "pound", valuePerUnit: 1, impactValue: 300 }] })).toBe(0);
    expect(detectInflatedDonations({ activityBreakdowns: [{ activityName: "Gave £300 a year", category: "Custom", impactValue: 250 }] })).toBe(0);
    expect(detectInflatedDonations(null)).toBe(0);
  });
});

describe("repairLocalInflatedDonations", () => {
  it("re-values the donation pound for pound and recomputes every total", () => {
    const repaired = repairLocalInflatedDonations(inflatedResult())!;
    const donation = repaired.activityBreakdowns![0]!;
    expect(donation).toMatchObject({ impactValue: 312, quantity: 312, valuePerUnit: 1, unit: "pound", hours: 0 });
    // The donation's 10 hours come off the time and personal growth values.
    expect(repaired.totalHours).toBe(20);
    expect(repaired.impactValue).toBe(412);
    expect(repaired.contributionValue).toBe(244.2);
    expect(repaired.personalDevelopmentValue).toBe(300);
    expect(repaired.donationsValue).toBe(40);
    expect(repaired.totalValue).toBe(412 + 244.2 + 40 + 300);
    expect(repaired.sdgBreakdowns).toEqual([
      { sdg: "No Poverty", sdgColor: "#E5243B", value: 312 },
      { sdg: "Life on Land", sdgColor: "#56C02B", value: 100 },
    ]);
  });

  it("returns null when nothing needs fixing", () => {
    const result = inflatedResult();
    result.activityBreakdowns = [result.activityBreakdowns[1]!];
    expect(repairLocalInflatedDonations(result)).toBeNull();
  });
});
