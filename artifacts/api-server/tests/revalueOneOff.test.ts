import { describe, it, expect } from "vitest";
import { calculateImpact } from "../src/lib/impactData.js";
import { planRevaluation, summarise, type RevalueRecord } from "../src/lib/revalueOneOff.js";

let nextId = 1;
/** An entry as it was saved before one-off valuation (yearly values). */
function saved(over: Partial<RevalueRecord> & { activities: { activityId: string; quantity: number; hoursPerYear: number }[]; extra?: Record<string, unknown> }): RevalueRecord {
  const calc = calculateImpact(over.activities, 0, 0, []);
  return {
    id: nextId++,
    userId: "u-1",
    kind: "quick_log",
    entryDate: new Date(Date.UTC(2026, 2, 1)),
    activitiesJson: over.activities,
    resultJson: { ...calc, ...(over.extra ?? {}) },
    donationsValue: "0",
    totalValue: String(calc.totalValue),
    isOrgCopy: false,
    ...over,
  };
}

describe("planRevaluation", () => {
  it("re-values weekly befriending logs as volunteering time", () => {
    const weeks = [0, 7, 14].map((d) => saved({ activities: [{ activityId: "befriending", quantity: 1, hoursPerYear: 2 }], entryDate: new Date(Date.UTC(2026, 2, 1 + d)) }));
    const changes = planRevaluation(weeks);
    expect(changes).toHaveLength(3);
    for (const c of changes) {
      expect(c.before).toBe(8040 + 2 * 12.21 + 2 * 15);
      expect(c.after).toBe(34 + 2 * 12.21 + 2 * 15);
    }
    expect(summarise(changes)).toMatchObject({ entries: 3, members: 1 });
  });

  it("counts a household habit once a year per member, then again the next year", () => {
    const habit = (y: number, m: number, userId = "u-1") =>
      saved({ userId, activities: [{ activityId: "food_waste", quantity: 1, hoursPerYear: 1 }], entryDate: new Date(Date.UTC(y, m, 1)) });
    const records = [habit(2026, 5), habit(2026, 1), habit(2026, 8), habit(2027, 0), habit(2026, 3, "u-2")];
    const changes = planRevaluation(records);
    // The earliest 2026 one (February) keeps its value; June and September go to 0.
    const byId = new Map(changes.map((c) => [c.id, c]));
    expect(byId.has(records[1]!.id)).toBe(false);
    expect(byId.get(records[0]!.id)?.after).toBe(0);
    expect(byId.get(records[2]!.id)?.after).toBe(0);
    // 2027, and another member's, are their own first.
    expect(byId.has(records[3]!.id)).toBe(false);
    expect(byId.has(records[4]!.id)).toBe(false);
  });

  it("leaves entries without yearly activities, and yearly estimates, alone", () => {
    const litter = saved({ activities: [{ activityId: "litter_picking", quantity: 1, hoursPerYear: 2 }] });
    const estimate = saved({ kind: "annual_estimate", activities: [{ activityId: "befriending", quantity: 1, hoursPerYear: 50 }] });
    expect(planRevaluation([litter, estimate])).toEqual([]);
  });

  it("keeps the rest of the entry, custom lines and donations included", () => {
    const record = saved({
      activities: [{ activityId: "mental_health_support", quantity: 2, hoursPerYear: 3 }],
      extra: { capturedBy: "email", orgRecordId: 99 },
    });
    // A custom "money raised" line and a donation, as stored.
    const calc = calculateImpact(
      [{ activityId: "mental_health_support", quantity: 2, hoursPerYear: 3 }],
      15,
      0,
      [{ activityId: "custom_raised_1", name: "Money raised for charity", quantity: 120, hoursPerYear: 0, valuePerUnit: 1, unit: "pound", proxy: "Amount raised for charity", proxyYear: "", sdg: "Partnerships for the Goals", sdgColor: "#19486A" }],
    );
    record.resultJson = { ...calc, capturedBy: "email", orgRecordId: 99 };
    record.totalValue = String(calc.totalValue);
    record.donationsValue = "15";
    const [change] = planRevaluation([record]);
    expect(change!.result).toMatchObject({ capturedBy: "email", orgRecordId: 99, donationsValue: 15 });
    const lines = change!.result.activityBreakdowns.map((b) => `${b.activityName}: ${b.impactValue}`);
    expect(lines).toContain("Money raised for charity: 120");
    expect(change!.after).toBe(3 * 17 + 120 + 15 + 3 * 12.21 + 3 * 15);
  });

  it("re-values organisation copies like the member's entry, without using up a household's year", () => {
    const own = saved({ activities: [{ activityId: "food_waste", quantity: 1, hoursPerYear: 1 }], entryDate: new Date(Date.UTC(2026, 1, 1)) });
    const copy = saved({ activities: [{ activityId: "food_waste", quantity: 1, hoursPerYear: 1 }], entryDate: new Date(Date.UTC(2026, 1, 1)), isOrgCopy: true });
    const later = saved({ activities: [{ activityId: "food_waste", quantity: 1, hoursPerYear: 1 }], entryDate: new Date(Date.UTC(2026, 4, 1)) });
    const ids = new Set(planRevaluation([copy, own, later]).map((c) => c.id));
    expect(ids.has(own.id)).toBe(false);
    expect(ids.has(copy.id)).toBe(false);
    expect(ids.has(later.id)).toBe(true);
  });
});
