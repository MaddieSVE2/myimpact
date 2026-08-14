import { describe, it, expect, vi } from "vitest";

// orgBreakdown imports impactData (ACTIVITIES) only; stub the db package in
// case transitive imports ever touch it.
vi.mock("@workspace/db", async () => {
  const schema = await import("../../../lib/db/src/schema/index.js");
  return { ...schema, db: {}, pool: {} };
});

const { computeOrgBreakdown, postcodeArea, parseBreakdownDimension, BREAKDOWN_DIMENSIONS } =
  await import("../src/lib/orgBreakdown.js");

function rec(overrides: Partial<Parameters<typeof computeOrgBreakdown>[0][number]> = {}) {
  return {
    userId: "user-1",
    entryDate: new Date("2026-03-15T12:00:00Z"),
    region: null,
    outwardCode: null,
    locationJson: null,
    resultJson: { totalHours: 10, totalValue: 100 },
    ...overrides,
  };
}

describe("parseBreakdownDimension", () => {
  it("accepts every documented dimension and rejects junk", () => {
    for (const d of BREAKDOWN_DIMENSIONS) expect(parseBreakdownDimension(d)).toBe(d);
    expect(parseBreakdownDimension("member_group")).toBeNull();
    expect(parseBreakdownDimension(42)).toBeNull();
    expect(parseBreakdownDimension(undefined)).toBeNull();
  });
});

describe("postcodeArea", () => {
  it("extracts the letter prefix from outward codes and full postcodes", () => {
    expect(postcodeArea("SW1A")).toBe("SW");
    expect(postcodeArea("sw1a 1aa")).toBe("SW");
    expect(postcodeArea("M1")).toBe("M");
    expect(postcodeArea("EH12 9DN")).toBe("EH");
    expect(postcodeArea("")).toBeNull();
    expect(postcodeArea(null)).toBeNull();
    expect(postcodeArea("12345")).toBeNull();
  });
});

describe("computeOrgBreakdown", () => {
  it("groups by month using the activity date (entry_date), sorted chronologically", () => {
    const rows = computeOrgBreakdown([
      rec({ entryDate: new Date("2026-05-02T00:00:00Z") }),
      rec({ entryDate: new Date("2026-03-20T00:00:00Z"), userId: "user-2" }),
      rec({ entryDate: new Date("2026-03-01T00:00:00Z") }),
    ], "month");
    expect(rows.map(r => r.key)).toEqual(["2026-03", "2026-05"]);
    expect(rows[0].label).toBe("Mar 2026");
    expect(rows[0].records).toBe(2);
    expect(rows[0].members).toBe(2);
    expect(rows[0].hours).toBe(20);
    expect(rows[0].valueGBP).toBe(200);
  });

  it("groups by structured location with legacy flat-column fallback", () => {
    const rows = computeOrgBreakdown([
      rec({ locationJson: { region: "Scotland", townCity: "Leith" } }),
      rec({ locationJson: null, region: "Scotland", userId: "user-2" }),
      rec({ locationJson: { region: "Wales" } }),
      rec({ locationJson: null, region: null }),
    ], "region");
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    expect(byKey["Scotland"].records).toBe(2);
    expect(byKey["Wales"].records).toBe(1);
    expect(byKey["Unknown"].records).toBe(1);
  });

  it("groups by postcode area from locationJson.postcode or outwardCode", () => {
    const rows = computeOrgBreakdown([
      rec({ locationJson: { postcode: "EH12 9DN" } }),
      rec({ outwardCode: "EH1", userId: "user-2" }),
      rec({ outwardCode: "SW1A" }),
    ], "postcode_area");
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    expect(byKey["EH"].records).toBe(2);
    expect(byKey["EH"].members).toBe(2);
    expect(byKey["SW"].records).toBe(1);
  });

  it("groups line-level dimensions from stored activityBreakdowns", () => {
    const rows = computeOrgBreakdown([
      rec({
        resultJson: {
          totalHours: 12,
          totalValue: 300,
          activityBreakdowns: [
            { activityId: "a", category: "Environment", sdg: "Climate Action", proxy: "Proxy A", impactValue: 100, hours: 4 },
            { activityId: "b", category: "Community", sdg: "Climate Action", proxy: "Proxy B", impactValue: 200, hours: 8 },
          ],
        },
      }),
    ], "sdg");
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("Climate Action");
    expect(rows[0].hours).toBe(12);
    expect(rows[0].valueGBP).toBe(300);
    // One record contributes to the group once even with two lines.
    expect(rows[0].records).toBe(1);

    const catRows = computeOrgBreakdown([
      rec({
        resultJson: {
          activityBreakdowns: [
            { category: "Environment", impactValue: 100, hours: 4 },
            { category: "Community", impactValue: 200, hours: 8 },
          ],
        },
      }),
    ], "category");
    expect(catRows.map(r => r.key).sort()).toEqual(["Community", "Environment"]);
  });

  it("line-level dimensions allocate the FULL stored record totals pro-rata (never just line sums)", () => {
    // A realistic calculated record: line impact values sum to 300 but the
    // stored total also includes contribution + personal-development +
    // donations value (900 total), and totalHours includes 3 additional
    // volunteer hours beyond the 12 line hours.
    const record = rec({
      resultJson: {
        totalHours: 15,
        totalValue: 900,
        activityBreakdowns: [
          { category: "Environment", sdg: "Climate Action", impactValue: 100, hours: 4 },
          { category: "Community", sdg: "Good Health", impactValue: 200, hours: 8 },
        ],
      },
    });
    const catRows = computeOrgBreakdown([record], "category");
    const byKey = Object.fromEntries(catRows.map(r => [r.key, r]));
    // Value split 100:200 → 300/600 of the 900 total; hours split 4:8 → 5/10 of 15.
    expect(byKey["Environment"].valueGBP).toBe(300);
    expect(byKey["Community"].valueGBP).toBe(600);
    expect(byKey["Environment"].hours).toBe(5);
    expect(byKey["Community"].hours).toBe(10);
    // Dimension totals equal the record-level (month view) totals exactly.
    expect(catRows.reduce((s, r) => s + r.valueGBP, 0)).toBe(900);
    expect(catRows.reduce((s, r) => s + r.hours, 0)).toBe(15);
    const monthRows = computeOrgBreakdown([record], "month");
    expect(monthRows[0].valueGBP).toBe(900);
    expect(monthRows[0].hours).toBe(15);
  });

  it("line-level dimensions: zero line values split equally; no lines fall to Unknown", () => {
    const zeroLines = computeOrgBreakdown([
      rec({
        resultJson: {
          totalHours: 6,
          totalValue: 90,
          activityBreakdowns: [
            { category: "A", impactValue: 0, hours: 0 },
            { category: "B", impactValue: 0, hours: 0 },
          ],
        },
      }),
    ], "category");
    const byKey = Object.fromEntries(zeroLines.map(r => [r.key, r]));
    expect(byKey["A"].valueGBP).toBe(45);
    expect(byKey["B"].valueGBP).toBe(45);
    expect(byKey["A"].hours).toBe(3);

    const noLines = computeOrgBreakdown([rec({ resultJson: { totalHours: 2, totalValue: 40 } })], "sdg");
    expect(noLines).toHaveLength(1);
    expect(noLines[0].key).toBe("Unknown");
    expect(noLines[0].valueGBP).toBe(40);
    expect(noLines[0].hours).toBe(2);
  });

  it("fractional pro-rata splits conserve the rounded org-wide totals exactly", () => {
    // £1 / 1 hour split evenly across three categories: naive per-group
    // rounding gives 3 × £0.33 = £0.99. The rows must instead sum to £1.00.
    const record = rec({
      resultJson: {
        totalHours: 1,
        totalValue: 1,
        activityBreakdowns: [
          { category: "A", impactValue: 0, hours: 0 },
          { category: "B", impactValue: 0, hours: 0 },
          { category: "C", impactValue: 0, hours: 0 },
        ],
      },
    });
    const rows = computeOrgBreakdown([record], "category");
    expect(Math.round(rows.reduce((s, r) => s + r.valueGBP, 0) * 100) / 100).toBe(1);
    expect(Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100).toBe(1);
    const monthRows = computeOrgBreakdown([record], "month");
    expect(monthRows[0].valueGBP).toBe(1);
    expect(monthRows[0].hours).toBe(1);
    // Deterministic: repeated runs produce identical rows.
    expect(computeOrgBreakdown([record], "category")).toEqual(rows);
  });

  it("sorts non-month dimensions by value descending", () => {
    const rows = computeOrgBreakdown([
      rec({ locationJson: { townCity: "Small" }, resultJson: { totalHours: 1, totalValue: 10 } }),
      rec({ locationJson: { townCity: "Big" }, resultJson: { totalHours: 5, totalValue: 500 } }),
    ], "town");
    expect(rows.map(r => r.key)).toEqual(["Big", "Small"]);
  });
});
