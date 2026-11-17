import { describe, it, expect } from "vitest";
import proxiesData from "../src/lib/proxyData.json";
import { classifyProxy } from "../src/lib/proxyClassify.js";
import type { StoredProxy } from "../src/lib/proxyStore.js";
import { calculateImpact } from "../src/lib/impactData.js";
import { correctResult, reviewCustomLines, type ReviewRecord } from "../src/lib/customValueReview.js";

// The proxy library as the startup seed classifies it.
const proxies = new Map<string, StoredProxy>(
  (proxiesData as Array<{ title: string; value: number; unit: string | number }>)
    .filter((p) => typeof p.title === "string" && typeof p.value === "number" && p.value > 0)
    .map((p, i) => [p.title, { id: i, enabled: true, ...classifyProxy(p) }]),
);

const FOOD_SPEND = "Average annual household spend on fresh fruit and vegetables";
const PLASTIC = "GMCA Plastic Materials - average carbon emissions per tonne of usage (primary production) (2024)";
const TREE = "Average cumulative benefit over 50 years of planting a tree";
const LITTER = "Cost of significant litter accumulation (low value)";

interface Custom {
  name: string;
  quantity: number;
  hours: number;
  unit: string;
  proxy?: string;
  valuePerUnit?: number;
}

let nextId = 1;
/** An entry as Quick Log saved it: one custom line each, plus any standard activities. */
function saved(custom: Custom[], activities: { activityId: string; quantity: number; hoursPerYear: number }[] = []): ReviewRecord {
  const result = calculateImpact(
    activities,
    0,
    0,
    custom.map((c, i) => ({
      activityId: `custom_${i}`,
      name: c.name,
      quantity: c.quantity,
      hoursPerYear: c.hours,
      valuePerUnit: c.valuePerUnit ?? (c.proxy ? proxies.get(c.proxy)!.value : 0),
      unit: c.unit,
      proxy: c.proxy ?? "",
      proxyYear: "2024",
      sdg: "Responsible Consumption and Production",
      sdgColor: "#BF8B2E",
    })),
  );
  return { id: nextId++, entryDate: new Date(Date.UTC(2026, 9, 20)), resultJson: result, isOrgCopy: false };
}

const review = (...records: ReviewRecord[]) => reviewCustomLines(records, proxies);
const BAGS = "I reuse single use plastic bags for shopping";

describe("reviewCustomLines", () => {
  it("finds bags that were counted as households", () => {
    // The unit was swapped to the proxy's own, so only the words give it away.
    const [line] = review(saved([{ name: BAGS, quantity: 75, hours: 150, unit: "household", proxy: FOOD_SPEND }]));
    expect(line).toMatchObject({ reason: "unrelated", suggested: true, removesValue: true, removesHours: true });
    expect(line.before).toBe(75 * 484 + 150 * (12.71 + 15));
    expect(line.after).toBe(0);
  });

  it("finds a per-tonne proxy applied to each bag", () => {
    const [line] = review(saved([{ name: BAGS, quantity: 75, hours: 150, unit: "item", proxy: PLASTIC }]));
    expect(line).toMatchObject({ reason: "unit", suggested: true, removesValue: true, removesHours: true, proxyUnit: "per tonne" });
    expect(line.after).toBe(0);
  });

  it("keeps a per-tonne value when the description gives tonnes", () => {
    expect(review(saved([{ name: "Collected a tonne of plastic from the beach", quantity: 1, hours: 16, unit: "item", proxy: PLASTIC }]))).toEqual([]);
  });

  it("keeps a fitting proxy and removes only the hours assumed for each item", () => {
    const [line] = review(saved([{ name: "Planted trees with the local group", quantity: 5, hours: 10, unit: "item", proxy: TREE }]));
    expect(line).toMatchObject({ reason: "hours", suggested: true, removesValue: false, removesHours: true });
    expect(line.after).toBe(5 * 1060);
  });

  it("removes hours assumed for a habit that had no proxy", () => {
    const [line] = review(saved([{ name: BAGS, quantity: 75, hours: 150, unit: "item" }]));
    expect(line).toMatchObject({ reason: "hours", removesValue: false, removesHours: true, before: 4156.5, after: 0 });
  });

  it("leaves hours the member gave, and those of sessions and people helped", () => {
    const records = [
      saved([{ name: "Planted trees with the local group", quantity: 5, hours: 3, unit: "item", proxy: TREE }]),
      saved([{ name: "Litter picking on our street", quantity: 10, hours: 20, unit: "household", proxy: LITTER }]),
      saved([{ name: "Ran a chess club at the library", quantity: 12, hours: 24, unit: "session" }]),
      saved([{ name: "Volunteering at the hospice", quantity: 1, hours: 40, unit: "hour", proxy: "Hourly value of volunteering" }]),
    ];
    // Five trees at £1,060 is large enough to be listed, but nothing is wrong with it.
    expect(review(...records)).toEqual([expect.objectContaining({ reason: "large", suggested: false, removesHours: false })]);
  });

  it("removes an unrelated proxy from an entry logged in hours but keeps the hours", () => {
    const [line] = review(saved([{ name: "Coaching the under 11s", quantity: 1, hours: 30, unit: "hour", proxy: FOOD_SPEND, valuePerUnit: 484 }]));
    expect(line).toMatchObject({ reason: "unrelated", removesValue: true, removesHours: false });
    expect(line.after).toBe(831.3);
  });

  it("ignores money and standard activities", () => {
    const record = saved(
      [{ name: "Raised £5,000 for the hospice", quantity: 5000, hours: 0, unit: "pound", proxy: "Amount raised for charity", valuePerUnit: 1 }],
      [{ activityId: "recycling", quantity: 26, hoursPerYear: 52 }],
    );
    expect(review(record)).toEqual([]);
  });
});

describe("correctResult", () => {
  it("takes the value and hours off the line and the entry's totals, and nothing else", () => {
    const record = saved(
      [{ name: BAGS, quantity: 75, hours: 150, unit: "household", proxy: FOOD_SPEND }],
      [{ activityId: "recycling", quantity: 26, hoursPerYear: 4 }],
    );
    const before = record.resultJson as ReturnType<typeof calculateImpact>;
    const after = correctResult(before, review(record));
    const [recycling, bags] = after.activityBreakdowns as Array<Record<string, unknown>>;

    expect(recycling).toEqual(before.activityBreakdowns[0]);
    expect(bags).toMatchObject({ activityName: BAGS, impactValue: 0, valuePerUnit: 0, proxy: "", hours: 0, quantity: 75 });
    expect(bags.valueRemoved).toMatchObject({ reason: "unrelated", proxy: FOOD_SPEND, valuePerUnit: 484, impactValue: 36300, hours: 150 });

    expect(after.totalHours).toBe(4);
    expect(after.impactValue).toBe(before.activityBreakdowns[0].impactValue);
    expect(after.contributionValue).toBe(50.84);
    expect(after.personalDevelopmentValue).toBe(60);
    expect(after.totalValue).toBe(Math.round((before.activityBreakdowns[0].impactValue + 50.84 + 60) * 100) / 100);
    expect(before.totalValue - after.totalValue).toBeCloseTo(36300 + 150 * 27.71, 2);
  });

  it("leaves nothing to correct afterwards", () => {
    const record = saved([
      { name: BAGS, quantity: 75, hours: 150, unit: "item", proxy: PLASTIC },
      { name: "Planted trees with the local group", quantity: 2, hours: 4, unit: "item", proxy: TREE },
    ]);
    const lines = review(record);
    expect(lines).toHaveLength(2);
    const after = correctResult(record.resultJson as Record<string, unknown>, lines);
    expect(after.totalValue).toBe(2 * 1060);
    expect(review({ ...record, resultJson: after }).filter((l) => l.suggested)).toEqual([]);
  });

  it("skips a line whose entry was edited since the list was drawn up", () => {
    const record = saved([{ name: BAGS, quantity: 75, hours: 150, unit: "item" }]);
    const [line] = review(record);
    const after = correctResult(record.resultJson as Record<string, unknown>, [{ ...line, activityId: "custom_other" }]);
    expect(after.totalValue).toBe((record.resultJson as { totalValue: number }).totalValue);
  });
});
