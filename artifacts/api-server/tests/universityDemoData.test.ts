import { describe, it, expect } from "vitest";
import { ACTIVITIES, calculateImpact } from "../src/lib/impactData.js";
import { isSyntheticSeedEmail } from "../src/lib/demoAccounts.js";
import {
  UNI_SYNTH_COUNT,
  academicYearOf,
  planUniRecords,
  planUniSurveyResponses,
  uniStudents,
} from "../src/lib/universityDemoData.js";

const MID_NOVEMBER_2026 = new Date("2026-11-16T12:00:00.000Z");
const keyOf = (r: { userId: string; name: string; entryDate: Date }) => `${r.userId}|${r.name}|${r.entryDate.getTime()}`;

/** Social value per academic year, valued exactly as the seed stores it. */
function valueByAcademicYear(now: Date): Map<number, number> {
  const totals = new Map<number, number>();
  for (const record of planUniRecords(now)) {
    const year = academicYearOf(record.entryDate);
    totals.set(year, (totals.get(year) ?? 0) + calculateImpact(record.activities, 0, 0, []).totalValue);
  }
  return totals;
}

describe("uniStudents", () => {
  const students = uniStudents();

  it("is a university-sized cohort: 10,240 registered with the manager and student persona", () => {
    expect(students).toHaveLength(UNI_SYNTH_COUNT);
    expect(students.length + 2).toBe(10_240);
  });

  it("gives every student their own id, email and name", () => {
    expect(new Set(students.map((s) => s.id)).size).toBe(students.length);
    expect(new Set(students.map((s) => s.email)).size).toBe(students.length);
    expect(new Set(students.map((s) => s.displayName)).size).toBe(students.length);
  });

  it("uses only addresses the email and push jobs skip", () => {
    expect(students.every((s) => isSyntheticSeedEmail(s.email))).toBe(true);
  });

  it("keeps the ids of the students seeded before the cohort grew", () => {
    expect(students[0]!.id).toBe("uni-synth-u-001");
    expect(students[24]!.id).toBe("uni-synth-u-025");
    expect(students.slice(0, 25).every((s) => s.logsActivity && s.intakeYear === 2025)).toBe(true);
  });

  it("is the same cohort on every call", () => {
    expect(uniStudents()).toBe(students);
  });
});

describe("planUniRecords", () => {
  const records = planUniRecords(MID_NOVEMBER_2026);

  it("shows over £1m in the current academic year and in the last full one", () => {
    const totals = valueByAcademicYear(MID_NOVEMBER_2026);
    expect(totals.get(2025)).toBeGreaterThan(3_000_000);
    expect(totals.get(2026)).toBeGreaterThan(1_000_000);
  });

  it("plans nothing dated in the future", () => {
    expect(records.every((r) => r.entryDate <= MID_NOVEMBER_2026)).toBe(true);
  });

  it("gives every record its own student, name and date", () => {
    expect(new Set(records.map(keyOf)).size).toBe(records.length);
  });

  it("only uses activities the calculator knows, logged by students who share", () => {
    const known = new Set(ACTIVITIES.map((a) => a.id));
    const loggers = new Map(uniStudents().filter((s) => s.logsActivity).map((s) => [s.id, s]));
    for (const record of records) {
      expect(record.activities.every((a) => known.has(a.activityId))).toBe(true);
      // Nobody logs for an academic year before the one they started in.
      expect(loggers.get(record.userId)!.intakeYear).toBeLessThanOrEqual(academicYearOf(record.entryDate));
    }
  });

  it("only ever adds records as time passes, so a re-run never duplicates one", () => {
    const earlier = planUniRecords(new Date("2026-10-03T08:00:00.000Z"));
    const later = new Set(records.map(keyOf));
    expect(earlier.length).toBeLessThan(records.length);
    expect(earlier.every((r) => later.has(keyOf(r)))).toBe(true);
  });

  it("starts each new academic year from nothing and keeps the last one whole", () => {
    const totals = valueByAcademicYear(new Date("2027-09-02T12:00:00.000Z"));
    expect(totals.get(2026)).toBeGreaterThan(4_000_000);
    expect(totals.get(2027) ?? 0).toBeLessThan(100_000);
  });
});

describe("planUniSurveyResponses", () => {
  const responses = planUniSurveyResponses(MID_NOVEMBER_2026);

  it("answers every closed window and leaves the open one for the demo", () => {
    const windows = new Set(responses.map((r) => `${r.surveyId} ${r.windowKey}`));
    expect(windows.has("uni-ps-001 2025-10")).toBe(true);
    expect(windows.has("uni-ps-001 2026-10")).toBe(true);
    expect(windows.has("uni-ps-001 2026-11")).toBe(false);
    expect(windows.has("uni-ps-002 2026-Q3")).toBe(true);
    expect(windows.has("uni-ps-002 2026-Q4")).toBe(false);
  });

  it("has one answer per student per window, each with a fixed id", () => {
    expect(new Set(responses.map((r) => r.id)).size).toBe(responses.length);
    expect(new Set(responses.map((r) => `${r.surveyId}|${r.userId}|${r.windowKey}`)).size).toBe(responses.length);
    expect(planUniSurveyResponses(MID_NOVEMBER_2026).map((r) => r.id)).toEqual(responses.map((r) => r.id));
  });

  it("gets hundreds of answers a window, all rated 1 to 5", () => {
    const perWindow = new Map<string, number>();
    for (const r of responses) perWindow.set(`${r.surveyId} ${r.windowKey}`, (perWindow.get(`${r.surveyId} ${r.windowKey}`) ?? 0) + 1);
    expect(Math.min(...perWindow.values())).toBeGreaterThanOrEqual(100);
    expect(responses.every((r) => r.rating >= 1 && r.rating <= 5)).toBe(true);
  });

  it("keeps the comments seeded before the cohort grew on the same students", () => {
    const comment = responses.find((r) => r.id === "seed-uni-ps-001-2025-11-u2");
    expect(comment?.userId).toBe("uni-synth-u-003");
    expect(comment?.comment).toBe("The mentoring scheme has been a highlight of my first term.");
  });

  it("uses no em dashes in the copy members would read", () => {
    expect(responses.some((r) => r.comment?.includes("—"))).toBe(false);
  });
});
