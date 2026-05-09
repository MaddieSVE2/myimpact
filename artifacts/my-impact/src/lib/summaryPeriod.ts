/**
 * Summary period utilities.
 * Pure date arithmetic — no external dependencies, works on both server and client.
 *
 * summaryYearStart format: "MM-DD" (e.g. "01-01" for calendar year,
 * "09-01" for academic year, "04-01" for financial year).
 */

export interface PeriodBounds {
  start: Date;  // inclusive, midnight UTC
  end: Date;    // exclusive, midnight UTC on first day of NEXT period
  label: string; // e.g. "1 Sep 2024 – 31 Aug 2025"
}

function parseYearStart(summaryYearStart: string): { month: number; day: number } {
  const parts = summaryYearStart.split("-").map(Number);
  const month = Math.max(0, Math.min(11, (parts[0] ?? 1) - 1));
  const day = Math.max(1, Math.min(31, parts[1] ?? 1));
  return { month, day };
}

/**
 * Given a summaryYearStart (e.g. "09-01") and a periodOffset
 * (0 = current period, -1 = one period back, +1 = one period forward),
 * returns the inclusive start and exclusive end of that period plus a label.
 *
 * The "current period" is the most recent period whose start date is <= referenceDate.
 */
export function getPeriodBounds(
  summaryYearStart: string,
  periodOffset: number = 0,
  referenceDate: Date = new Date(),
): PeriodBounds {
  const { month, day } = parseYearStart(summaryYearStart);

  // Find the start year of the current period (most recent period start <= ref).
  let startYear = referenceDate.getUTCFullYear();
  const thisPeriodStart = new Date(Date.UTC(startYear, month, day, 0, 0, 0));
  if (thisPeriodStart > referenceDate) {
    startYear -= 1;
  }

  // Apply offset.
  startYear += periodOffset;

  const start = new Date(Date.UTC(startYear, month, day, 0, 0, 0));
  const end = new Date(Date.UTC(startYear + 1, month, day, 0, 0, 0));

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const lastDay = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const label = `${fmt(start)} – ${fmt(lastDay)}`;

  return { start, end, label };
}

export type SummaryPeriodType = "calendar" | "academic" | "financial" | "custom";

export interface PeriodPreset {
  label: string;
  summaryYearStart: string;
}

export const SUMMARY_PERIOD_PRESETS: Record<Exclude<SummaryPeriodType, "custom">, PeriodPreset> = {
  calendar:  { label: "Calendar year (Jan – Dec)", summaryYearStart: "01-01" },
  academic:  { label: "Academic year (Sep – Aug)", summaryYearStart: "09-01" },
  financial: { label: "Financial year (Apr – Mar)", summaryYearStart: "04-01" },
};

export function detectPeriodType(summaryYearStart: string): SummaryPeriodType {
  if (summaryYearStart === "01-01") return "calendar";
  if (summaryYearStart === "09-01") return "academic";
  if (summaryYearStart === "04-01") return "financial";
  return "custom";
}

/**
 * Returns true if a DemoActivity's occurredAt date falls within [start, end).
 */
export function activityInPeriod(occurredAt: string, bounds: PeriodBounds): boolean {
  const d = new Date(occurredAt + "T00:00:00Z");
  return d >= bounds.start && d < bounds.end;
}
