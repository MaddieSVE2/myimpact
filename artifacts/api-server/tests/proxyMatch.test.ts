import { describe, it, expect } from "vitest";
import proxiesData from "../src/lib/proxyData.json";
import { classifyProxy } from "../src/lib/proxyClassify.js";
import type { StoredProxy } from "../src/lib/proxyStore.js";
import { candidateProxies, safeHoursPerUnit, unitFitsProxy } from "../src/lib/proxyMatch.js";

// The proxy library as the startup seed classifies it.
const proxies: StoredProxy[] = (proxiesData as Array<{ title: string; value: number; unit: string | number }>)
  .filter((p) => typeof p.title === "string" && typeof p.value === "number" && p.value > 0)
  .map((p, i) => ({ id: i, enabled: true, ...classifyProxy(p) }));

const proxy = (titlePart: string) => {
  const found = proxies.find((p) => p.title.includes(titlePart));
  if (!found) throw new Error(`No proxy titled like "${titlePart}"`);
  return found;
};
const titles = (name: string) => candidateProxies(proxies, name).map((p) => p.title);

describe("candidateProxies", () => {
  it("matches whole words, not letters inside other words", () => {
    // "use" is inside "household" and "drug users"; neither is about bags.
    const shortlist = titles("I reuse single use plastic bags for shopping");
    expect(shortlist.some((t) => /household spend|drug|domestic abuse|house fire/i.test(t))).toBe(false);
    expect(shortlist.length).toBeLessThanOrEqual(3);
  });

  it("puts the proxy sharing the rarest word first", () => {
    expect(titles("Planted trees with the local group")[0]).toMatch(/planting a tree/i);
    expect(titles("Collected surplus food for redistribution")[0]).toBe("Value of redistributed surplus food");
  });

  it("matches other forms of a word", () => {
    expect(titles("Volunteering at a homeless shelter").some((t) => /homelessness/i.test(t))).toBe(true);
    expect(titles("Helping at food banks")).toContain("Value of helping others");
  });

  it("offers nothing when nothing matches", () => {
    expect(titles("Giving blood")).toEqual([]);
    expect(titles("I do it")).toEqual([]);
  });
});

describe("unitFitsProxy", () => {
  it("never prices each bag at a per-tonne, per-hectare or per-household figure", () => {
    for (const p of proxies) {
      if (/tonne|hectare|household|incident|propert|prisoner/i.test(p.unit)) {
        expect(unitFitsProxy(p, "item", "bags per year"), `${p.title} (${p.unit})`).toBe(false);
      }
    }
  });

  it("fits a measured proxy only when the person is asked for that measure", () => {
    const plastic = proxy("GMCA Plastic Materials");
    expect(unitFitsProxy(plastic, "item", "bags per year")).toBe(false);
    expect(unitFitsProxy(plastic, "item", "tonnes of plastic per year")).toBe(true);
    expect(unitFitsProxy(proxy("Saving per mile of cycling"), "item", "miles per year")).toBe(true);
    expect(unitFitsProxy(proxy("Saving per mile of cycling"), "session", "journeys per year")).toBe(false);
  });

  it("does not take 'per year' in a label for a proxy priced per year or week", () => {
    const weekly = proxy("Attendance Allowance - Higher Rate");
    expect(weekly.unit).toBe("Per week");
    expect(unitFitsProxy(weekly, "session", "visits per year")).toBe(false);
    expect(unitFitsProxy(weekly, "session", "weeks per year")).toBe(true);
  });

  it("holds a proxy to its allowed units instead of swapping the unit", () => {
    const parcels = proxy("food parcels provided by food banks");
    expect(parcels.allowedUnits).toEqual(["household"]);
    expect(unitFitsProxy(parcels, "household", "households")).toBe(true);
    expect(unitFitsProxy(parcels, "session", "shifts per year")).toBe(false);
  });

  it("goes by the proxy's own unit where no allowed unit says it", () => {
    // Stored as per person, priced per hour volunteered.
    expect(unitFitsProxy(proxy("Hourly value of volunteering"), "hour", "hours per year")).toBe(true);
    expect(unitFitsProxy(proxy("help at home carer"), "hour", "hours per year")).toBe(true);
    expect(unitFitsProxy(proxy("relationship counselling"), "session", "sessions per year")).toBe(true);
    expect(unitFitsProxy(proxy("benefit over 50 years of planting a tree"), "item", "trees planted")).toBe(true);
    expect(unitFitsProxy(proxy("benefit over 50 years of planting a tree"), "item", "bags per year")).toBe(false);
    expect(unitFitsProxy(proxy("community health visit"), "session", "sessions per year")).toBe(true);
  });
});

describe("safeHoursPerUnit", () => {
  it("keeps an everyday habit at no hours", () => {
    expect(safeHoursPerUnit(0)).toBe(0);
  });

  it("caps an estimate at a working day", () => {
    expect(safeHoursPerUnit(0.5)).toBe(0.5);
    expect(safeHoursPerUnit(40)).toBe(8);
  });

  it("falls back to two hours when there is no usable estimate", () => {
    for (const raw of [undefined, null, "3", NaN, -1]) expect(safeHoursPerUnit(raw)).toBe(2);
  });
});
