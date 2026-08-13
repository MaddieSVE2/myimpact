// Contribution data model: estimate-vs-actual reconciliation, activity
// location round-tripping, and reporting-period derivation.
//
// The core regression guarantee: any dataset containing NO
// annual_estimate/quick_log mix produces a ZERO adjustment, so every existing
// aggregation surface (recap, yoy, org stats, verified totals) returns
// byte-identical numbers for historical (all-'legacy') data.

import { describe, it, expect } from "vitest";
import {
  computeEstimateActualReconciliation,
  normalizeActivityLocation,
  deriveReportingYear,
  parseRecordKind,
  RECORD_KINDS,
  type ReconcilableRecord,
} from "../src/lib/contributionModel.js";

const VOLUNTEER_RATE = 12.21;
const PD_RATE = 15;

function record(opts: {
  kind?: string;
  userId?: string;
  entryDate?: string;
  reportingYear?: number | null;
  activities?: Array<{ activityId: string; impactValue: number; hours: number; category?: string; sdg?: string }>;
  donationsValue?: number;
}): ReconcilableRecord {
  const activities = opts.activities ?? [];
  const impact = activities.reduce((s, a) => s + a.impactValue, 0);
  const hours = activities.reduce((s, a) => s + a.hours, 0);
  const donations = opts.donationsValue ?? 0;
  return {
    userId: opts.userId ?? "u1",
    kind: opts.kind ?? "legacy",
    entryDate: new Date(opts.entryDate ?? "2026-06-15T00:00:00Z"),
    reportingYear: opts.reportingYear,
    resultJson: {
      totalValue: impact + donations + hours * (VOLUNTEER_RATE + PD_RATE),
      totalHours: hours,
      impactValue: impact,
      donationsValue: donations,
      activityBreakdowns: activities.map((a) => ({
        activityId: a.activityId,
        activityName: a.activityId,
        category: a.category ?? "Community",
        sdg: a.sdg ?? "Good Health and Well-Being",
        sdgColor: "#4C9F38",
        impactValue: a.impactValue,
        hours: a.hours,
      })),
    },
  };
}

function rawTotals(records: ReconcilableRecord[]) {
  let totalValue = 0;
  let totalHours = 0;
  for (const r of records) {
    const j = r.resultJson as { totalValue: number; totalHours: number };
    totalValue += j.totalValue;
    totalHours += j.totalHours;
  }
  return { totalValue, totalHours };
}

describe("computeEstimateActualReconciliation", () => {
  it("legacy-only data (historical records) gets a zero adjustment — totals unchanged", () => {
    const records = [
      record({ kind: "legacy", activities: [{ activityId: "community_garden", impactValue: 721.5, hours: 50 }], donationsValue: 100 }),
      record({ kind: "legacy", activities: [{ activityId: "food_bank", impactValue: 2220, hours: 0 }] }),
      record({ kind: "recurring_confirmation", activities: [{ activityId: "community_garden", impactValue: 57.72, hours: 4 }] }),
      record({ kind: "bulk_retrospective", activities: [{ activityId: "recycling", impactValue: 32.76, hours: 0 }] }),
      record({ kind: "org_api", activities: [{ activityId: "org_attested", impactValue: 120, hours: 10 }] }),
    ];
    const recon = computeEstimateActualReconciliation(records);
    expect(recon.valueExcess).toBe(0);
    expect(recon.hoursExcess).toBe(0);
    expect(recon.donationExcess).toBe(0);
    expect(recon.activities).toEqual([]);
  });

  it("estimate only: no adjustment", () => {
    const recon = computeEstimateActualReconciliation([
      record({ kind: "annual_estimate", activities: [{ activityId: "community_garden", impactValue: 721.5, hours: 50 }] }),
    ]);
    expect(recon.valueExcess).toBe(0);
    expect(recon.activities).toEqual([]);
  });

  it("actuals only: no adjustment", () => {
    const recon = computeEstimateActualReconciliation([
      record({ kind: "quick_log", activities: [{ activityId: "community_garden", impactValue: 28.86, hours: 2 }] }),
      record({ kind: "quick_log", activities: [{ activityId: "community_garden", impactValue: 28.86, hours: 2 }] }),
    ]);
    expect(recon.valueExcess).toBe(0);
    expect(recon.activities).toEqual([]);
  });

  it("mixed: same activity in estimate + quick logs counts once (greater of the two)", () => {
    // Annual estimate: 50h gardening (£721.50). Quick logged so far: 2h + 3h.
    const records = [
      record({ kind: "annual_estimate", activities: [{ activityId: "community_garden", impactValue: 721.5, hours: 50 }] }),
      record({ kind: "quick_log", entryDate: "2026-05-03T00:00:00Z", activities: [{ activityId: "community_garden", impactValue: 28.86, hours: 2 }] }),
      record({ kind: "quick_log", entryDate: "2026-05-10T00:00:00Z", activities: [{ activityId: "community_garden", impactValue: 43.29, hours: 3 }] }),
    ];
    const recon = computeEstimateActualReconciliation(records);
    // Logged (72.15, 5h) < estimated (721.50, 50h) → overlap removed = logged.
    expect(recon.hoursExcess).toBeCloseTo(5, 6);
    expect(recon.valueExcess).toBeCloseTo(72.15 + 5 * (VOLUNTEER_RATE + PD_RATE), 6);

    const raw = rawTotals(records);
    const headlineValue = raw.totalValue - recon.valueExcess;
    const headlineHours = raw.totalHours - recon.hoursExcess;
    // Headline equals the estimate-only totals (the greater side counted once).
    expect(headlineHours).toBeCloseTo(50, 6);
    expect(headlineValue).toBeCloseTo(721.5 + 50 * (VOLUNTEER_RATE + PD_RATE), 6);

    // Per-activity "Estimated: X / Logged so far: Y" detail.
    expect(recon.activities).toHaveLength(1);
    const a = recon.activities[0];
    expect(a.activityId).toBe("community_garden");
    expect(a.estimatedValue).toBeCloseTo(721.5, 2);
    expect(a.loggedValue).toBeCloseTo(72.15, 2);
    expect(a.countedValue).toBeCloseTo(721.5, 2);
    expect(a.estimatedHours).toBe(50);
    expect(a.loggedHours).toBe(5);
    expect(a.countedHours).toBe(50);
  });

  it("mixed with logged exceeding estimate: logged side wins", () => {
    const records = [
      record({ kind: "annual_estimate", activities: [{ activityId: "tutoring", impactValue: 231, hours: 10 }] }),
      record({ kind: "quick_log", activities: [{ activityId: "tutoring", impactValue: 693, hours: 30 }] }),
    ];
    const recon = computeEstimateActualReconciliation(records);
    const raw = rawTotals(records);
    expect(raw.totalHours - recon.hoursExcess).toBeCloseTo(30, 6);
    expect(raw.totalValue - recon.valueExcess).toBeCloseTo(693 + 30 * (VOLUNTEER_RATE + PD_RATE), 6);
    expect(recon.activities[0].countedValue).toBeCloseTo(693, 2);
  });

  it("different activities never reconcile against each other", () => {
    const recon = computeEstimateActualReconciliation([
      record({ kind: "annual_estimate", activities: [{ activityId: "community_garden", impactValue: 721.5, hours: 50 }] }),
      record({ kind: "quick_log", activities: [{ activityId: "food_bank", impactValue: 185, hours: 0 }] }),
    ]);
    expect(recon.valueExcess).toBe(0);
    expect(recon.activities).toEqual([]);
  });

  it("cross-year: estimate in one year never reconciles against actuals in another", () => {
    const recon = computeEstimateActualReconciliation([
      record({ kind: "annual_estimate", entryDate: "2025-01-15T00:00:00Z", activities: [{ activityId: "community_garden", impactValue: 721.5, hours: 50 }] }),
      record({ kind: "quick_log", entryDate: "2026-05-03T00:00:00Z", activities: [{ activityId: "community_garden", impactValue: 28.86, hours: 2 }] }),
    ]);
    expect(recon.valueExcess).toBe(0);
    expect(recon.activities).toEqual([]);
  });

  it("explicit reportingYear takes precedence over entryDate year", () => {
    const recon = computeEstimateActualReconciliation([
      record({ kind: "annual_estimate", entryDate: "2025-12-31T00:00:00Z", reportingYear: 2026, activities: [{ activityId: "community_garden", impactValue: 721.5, hours: 50 }] }),
      record({ kind: "quick_log", entryDate: "2026-05-03T00:00:00Z", reportingYear: 2026, activities: [{ activityId: "community_garden", impactValue: 28.86, hours: 2 }] }),
    ]);
    expect(recon.activities).toHaveLength(1);
  });

  it("different users never reconcile against each other (org pipelines)", () => {
    const recon = computeEstimateActualReconciliation([
      record({ userId: "alice", kind: "annual_estimate", activities: [{ activityId: "community_garden", impactValue: 721.5, hours: 50 }] }),
      record({ userId: "bob", kind: "quick_log", activities: [{ activityId: "community_garden", impactValue: 28.86, hours: 2 }] }),
    ]);
    expect(recon.valueExcess).toBe(0);
  });

  it("donations follow the same once-per-year rule", () => {
    const records = [
      record({ kind: "annual_estimate", donationsValue: 120 }),
      record({ kind: "quick_log", donationsValue: 50 }),
    ];
    const recon = computeEstimateActualReconciliation(records);
    expect(recon.donationExcess).toBeCloseTo(50, 6);
    const raw = rawTotals(records);
    expect(raw.totalValue - recon.valueExcess).toBeCloseTo(120, 6);
  });
});

describe("normalizeActivityLocation", () => {
  it("round-trips a full structured location", () => {
    const input = {
      mode: "in_person",
      label: "Sunnybank Community Garden",
      postcode: "LS6 3HN",
      townCity: "Leeds",
      lat: 53.8195,
      lng: -1.5694,
      localAuthority: "Leeds",
      region: "Yorkshire and the Humber",
      country: "England",
    };
    expect(normalizeActivityLocation(input)).toEqual(input);
  });

  it("accepts 'Online / remote' and 'Multiple locations' as valid values", () => {
    expect(normalizeActivityLocation({ mode: "online" })?.mode).toBe("online");
    expect(normalizeActivityLocation({ mode: "multiple" })?.mode).toBe("multiple");
  });

  it("rejects junk: non-objects, empty objects, out-of-range coords", () => {
    expect(normalizeActivityLocation(null)).toBeNull();
    expect(normalizeActivityLocation("Leeds")).toBeNull();
    expect(normalizeActivityLocation([])).toBeNull();
    expect(normalizeActivityLocation({})).toBeNull();
    const loc = normalizeActivityLocation({ label: "x", lat: 999, lng: -720 });
    expect(loc?.lat).toBeNull();
    expect(loc?.lng).toBeNull();
  });

  it("trims and drops empty strings", () => {
    const loc = normalizeActivityLocation({ label: "  Park  ", postcode: "   " });
    expect(loc?.label).toBe("Park");
    expect(loc?.postcode).toBeNull();
  });
});

describe("deriveReportingYear / parseRecordKind", () => {
  it("derives the calendar year from the entry date", () => {
    expect(deriveReportingYear(new Date("2026-08-13T12:00:00Z"))).toBe(2026);
    expect(deriveReportingYear(new Date("2025-12-31T23:59:59Z"))).toBe(2025);
  });

  it("returns null (record still saves) for invalid/out-of-window dates", () => {
    expect(deriveReportingYear(new Date("invalid"))).toBeNull();
    expect(deriveReportingYear(new Date("1900-01-01T00:00:00Z"))).toBeNull();
    expect(deriveReportingYear(null)).toBeNull();
  });

  it("parses only known kinds", () => {
    for (const k of RECORD_KINDS) expect(parseRecordKind(k)).toBe(k);
    expect(parseRecordKind("estimate")).toBeNull();
    expect(parseRecordKind(42)).toBeNull();
    expect(parseRecordKind(undefined)).toBeNull();
  });
});
