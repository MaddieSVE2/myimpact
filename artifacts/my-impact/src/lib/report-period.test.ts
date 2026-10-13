import { describe, expect, it } from "vitest";
import {
  academicPeriod,
  calendarPeriod,
  currentAcademicStartYear,
  customPeriod,
  formatPeriodRange,
  isReportPeriod,
} from "./report-period";

describe("report periods", () => {
  it("covers a calendar year", () => {
    expect(calendarPeriod(2026)).toEqual({ type: "calendar", startDate: "2026-01-01", endDate: "2026-12-31", label: "My Impact 2026" });
  });

  it("runs an academic year from 1 September to 31 August", () => {
    expect(academicPeriod(2026)).toEqual({ type: "academic", startDate: "2026-09-01", endDate: "2027-08-31", label: "My Impact 2026/27" });
  });

  it("names a custom period after the years it spans", () => {
    expect(customPeriod("2026-04-01", "2027-03-31").label).toBe("My Impact 2026/27");
    expect(customPeriod("2026-02-01", "2026-06-30").label).toBe("My Impact 2026");
  });

  it("switches academic year on 1 September", () => {
    expect(currentAcademicStartYear(new Date(2026, 7, 31))).toBe(2025);
    expect(currentAcademicStartYear(new Date(2026, 8, 1))).toBe(2026);
  });

  it("formats the dates it covers", () => {
    expect(formatPeriodRange(calendarPeriod(2026))).toBe("1 Jan 2026 – 31 Dec 2026");
  });

  it("only accepts a saved period that is complete and in order", () => {
    expect(isReportPeriod(academicPeriod(2025))).toBe(true);
    expect(isReportPeriod({ ...calendarPeriod(2026), startDate: "2027-01-01" })).toBe(false);
    expect(isReportPeriod({ ...calendarPeriod(2026), endDate: "31/12/2026" })).toBe(false);
    expect(isReportPeriod({ ...calendarPeriod(2026), type: "weekly" })).toBe(false);
    expect(isReportPeriod({ ...calendarPeriod(2026), label: "" })).toBe(false);
    expect(isReportPeriod(null)).toBe(false);
  });
});
