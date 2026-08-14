/**
 * Authoritative Full Impact Report period helpers.
 *
 * The period is chosen ONCE at the start of the report journey (calendar
 * year, academic year, or a supported custom range) and carried through
 * calculation, save, and display. All dates are inclusive ISO YYYY-MM-DD
 * strings; boundary arithmetic reuses the shared summary-period config so
 * academic years match the rest of the app (Sep – Aug).
 */
import { SUMMARY_PERIOD_PRESETS } from "@/lib/summaryPeriod";

export type ReportPeriodType = "calendar" | "academic" | "custom";

export interface ReportPeriod {
  type: ReportPeriodType;
  /** Inclusive ISO YYYY-MM-DD. */
  startDate: string;
  /** Inclusive ISO YYYY-MM-DD. */
  endDate: string;
  /** Default display name, e.g. "My Impact 2026" / "My Impact 2026/27". */
  label: string;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Calendar-year period: 1 Jan – 31 Dec. */
export function calendarPeriod(year: number): ReportPeriod {
  return {
    type: "calendar",
    startDate: iso(year, 1, 1),
    endDate: iso(year, 12, 31),
    label: `My Impact ${year}`,
  };
}

/**
 * Academic-year period starting in `startYear`, using the shared academic
 * boundary config ("09-01": 1 Sep – 31 Aug).
 */
export function academicPeriod(startYear: number): ReportPeriod {
  const [mm] = SUMMARY_PERIOD_PRESETS.academic.summaryYearStart.split("-").map(Number);
  const startMonth = mm ?? 9;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  const endDay = new Date(endYear, endMonth, 0).getDate();
  return {
    type: "academic",
    startDate: iso(startYear, startMonth, 1),
    endDate: iso(endYear, endMonth, endDay),
    label: `My Impact ${startYear}/${String(endYear % 100).padStart(2, "0")}`,
  };
}

/** Custom period with a name derived from the years it spans. */
export function customPeriod(startDate: string, endDate: string): ReportPeriod {
  const sy = Number(startDate.slice(0, 4));
  const ey = Number(endDate.slice(0, 4));
  return {
    type: "custom",
    startDate,
    endDate,
    label: sy === ey ? `My Impact ${sy}` : `My Impact ${sy}/${String(ey % 100).padStart(2, "0")}`,
  };
}

/**
 * The academic year that contains `now` (before September we are in the year
 * that started the previous calendar year).
 */
export function currentAcademicStartYear(now: Date = new Date()): number {
  const [mm] = SUMMARY_PERIOD_PRESETS.academic.summaryYearStart.split("-").map(Number);
  const startMonth = mm ?? 9;
  return now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
}

/** Sensible default: the current calendar year. */
export function defaultReportPeriod(now: Date = new Date()): ReportPeriod {
  return calendarPeriod(now.getFullYear());
}

/** Human-readable coverage line, e.g. "1 Jan – 31 Dec 2026". */
export function formatPeriodRange(period: ReportPeriod): string {
  const fmt = (isoDate: string) =>
    new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(period.startDate)} – ${fmt(period.endDate)}`;
}

/** Type guard used when restoring a period from a persisted wizard draft. */
export function isReportPeriod(v: unknown): v is ReportPeriod {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  return (
    (o.type === "calendar" || o.type === "academic" || o.type === "custom") &&
    typeof o.startDate === "string" && isoRe.test(o.startDate) &&
    typeof o.endDate === "string" && isoRe.test(o.endDate) &&
    o.startDate <= o.endDate &&
    typeof o.label === "string" && o.label.length > 0
  );
}
