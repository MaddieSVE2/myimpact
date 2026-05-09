/**
 * Summary period utilities (server-side copy).
 * Pure date arithmetic — no external dependencies.
 *
 * summaryYearStart format: "MM-DD" (e.g. "01-01" for calendar year,
 * "09-01" for academic year, "04-01" for financial year).
 */

export interface PeriodBounds {
  start: Date;  // inclusive, midnight UTC
  end: Date;    // exclusive, midnight UTC on first day of NEXT period
  label: string;
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
 * returns the inclusive start and exclusive end of that period.
 */
export function getPeriodBounds(
  summaryYearStart: string,
  periodOffset: number = 0,
  referenceDate: Date = new Date(),
): PeriodBounds {
  const { month, day } = parseYearStart(summaryYearStart);

  let startYear = referenceDate.getUTCFullYear();
  const thisPeriodStart = new Date(Date.UTC(startYear, month, day, 0, 0, 0));
  if (thisPeriodStart > referenceDate) {
    startYear -= 1;
  }
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

/**
 * Validate a summaryYearStart value. Returns true when the value is a
 * well-formed "MM-DD" string with a plausible month and day.
 */
// Max days per month — Feb uses 29 (leap-year-safe anchor; rejects 30/31).
const MONTH_MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isValidSummaryYearStart(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = /^(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const month = parseInt(m[1]!, 10);
  const day = parseInt(m[2]!, 10);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= MONTH_MAX_DAYS[month - 1]!;
}
