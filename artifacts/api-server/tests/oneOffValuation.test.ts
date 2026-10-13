import { describe, it, expect } from "vitest";
import {
  ACTIVITIES,
  calculateImpact,
  ONE_OFF_KINDS,
  YEARLY_HOUSEHOLD_ACTIVITY_IDS,
  YEARLY_PER_PERSON_ACTIVITY_IDS,
} from "../src/lib/impactData.js";
import * as client from "../../my-impact/src/lib/one-off-logging.js";

const line = (activityId: string, quantity: number, hoursPerYear: number) => ({ activityId, quantity, hoursPerYear });

describe("one-off valuation of yearly activities", () => {
  it("values a yearly per-person activity as volunteering time in a one-off entry", () => {
    const r = calculateImpact([line("befriending", 1, 2)], 0, 0, [], { oneOff: true });
    expect(r.activityBreakdowns[0]).toMatchObject({ activityId: "befriending", impactValue: 34, hours: 2, unit: "hour", valuePerUnit: 17 });
    expect(r.activityBreakdowns[0]!.proxy).toMatch(/single occasion/);
    // 34 for the hours + 2h of volunteering (12.21) and personal development (15).
    expect(r.totalValue).toBe(34 + 2 * 12.21 + 2 * 15);
  });

  it("leaves yearly estimates and other entries as they were", () => {
    expect(calculateImpact([line("befriending", 1, 2)], 0, 0, []).activityBreakdowns[0]!.impactValue).toBe(8040);
    expect(calculateImpact([line("befriending", 1, 2)], 0, 0, [], { oneOff: false }).activityBreakdowns[0]!.impactValue).toBe(8040);
  });

  it("doesn't change activities that are already per occasion", () => {
    const oneOff = calculateImpact([line("litter_picking", 1, 2), line("food_bank", 1, 3)], 0, 0, [], { oneOff: true });
    const normal = calculateImpact([line("litter_picking", 1, 2), line("food_bank", 1, 3)], 0, 0, []);
    expect(oneOff.totalValue).toBe(normal.totalValue);
  });

  it("counts a household habit once a year", () => {
    const first = calculateImpact([line("food_waste", 1, 1)], 0, 0, [], { oneOff: true, householdsCountedThisYear: new Set() });
    expect(first.activityBreakdowns[0]!.impactValue).toBe(631);
    const again = calculateImpact([line("food_waste", 1, 1)], 0, 0, [], { oneOff: true, householdsCountedThisYear: new Set(["food_waste"]) });
    expect(again.activityBreakdowns[0]).toMatchObject({ impactValue: 0, hours: 0 });
    expect(again.activityBreakdowns[0]!.proxy).toMatch(/already counted/);
    expect(again.totalValue).toBe(0);
    expect(again.totalHours).toBe(0);
  });

  it("only applies the yearly rules to the activities that need them", () => {
    for (const id of YEARLY_PER_PERSON_ACTIVITY_IDS) {
      const a = ACTIVITIES.find((x) => x.id === id);
      expect(a, id).toBeTruthy();
      expect(a!.unit, id).not.toBe("hour");
    }
    for (const id of YEARLY_HOUSEHOLD_ACTIVITY_IDS) expect(ACTIVITIES.find((x) => x.id === id)?.unit, id).toBe("household");
  });

  it("matches the web app's lists", () => {
    expect([...client.YEARLY_PER_PERSON_ACTIVITY_IDS].sort()).toEqual([...YEARLY_PER_PERSON_ACTIVITY_IDS].sort());
    expect([...client.YEARLY_HOUSEHOLD_ACTIVITY_IDS].sort()).toEqual([...YEARLY_HOUSEHOLD_ACTIVITY_IDS].sort());
    expect([...client.ONE_OFF_KINDS].sort()).toEqual([...ONE_OFF_KINDS].sort());
  });
});
