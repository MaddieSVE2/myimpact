import { describe, it, expect } from "vitest";
import { calculateImpact } from "../src/lib/impactData.js";
import { customLinesFromResult } from "../src/lib/customLines.js";

describe("customLinesFromResult", () => {
  it("reads a free-text quick log, which has no standard activities", () => {
    // As Quick Log saves "I did a bake sale and raised £200": one custom line.
    const result = calculateImpact([], 0, 0, [
      { activityId: "custom_1760000000000", name: "I did a bake sale and raised £200", quantity: 200, hoursPerYear: 0, valuePerUnit: 1, unit: "pound", proxy: "Amount raised for charity", proxyYear: "", sdg: "Partnerships for the Goals", sdgColor: "#19486A" },
    ]);
    expect(customLinesFromResult(result)).toEqual([
      {
        activityId: "custom_1760000000000",
        name: "I did a bake sale and raised £200",
        hours: 0,
        quantity: 200,
        impactValue: 200,
        valuePerUnit: 1,
        unit: "pound",
        unitLabel: "pounds",
        proxy: "Amount raised for charity",
        proxyYear: "",
      },
    ]);
  });

  it("skips standard activities", () => {
    const result = calculateImpact([{ activityId: "litter_picking", quantity: 1, hoursPerYear: 2 }], 0, 0, []);
    expect(customLinesFromResult(result)).toEqual([]);
  });

  it("works out the rate of an older line saved without one", () => {
    const lines = customLinesFromResult({
      activityBreakdowns: [{ activityId: "custom_9", activityName: "Coached chess", category: "Custom", impactValue: 120, hours: 10, unit: "hour" }],
    });
    expect(lines[0]).toMatchObject({ valuePerUnit: 12, unitLabel: "hrs", impactValue: 120 });
  });

  it("copes with results that have no breakdowns", () => {
    expect(customLinesFromResult(null)).toEqual([]);
    expect(customLinesFromResult({})).toEqual([]);
  });
});
