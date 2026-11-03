// Turns "2 hours a week for most of the year" into the annual hours figure the
// impact calculation works from. Only the annual figure is saved; the basis is
// how the person chose to answer.
//
// Weekly volunteering rarely scales to 52 weeks, so a weekly or monthly answer
// always says how much of the year it covers. The presets are assumptions:
// nearly all year allows about six weeks of holidays, most of the year allows
// for about one week in four being missed (close to a 39-week school year),
// and part of the year is six months.

export type HoursPeriod = "week" | "month" | "year";
export type YearShare = "nearly_all" | "most" | "part" | "custom";

export const YEAR_SHARE_PRESETS: { id: Exclude<YearShare, "custom">; weeks: number; months: number }[] = [
  { id: "nearly_all", weeks: 46, months: 11 },
  { id: "most", weeks: 40, months: 9 },
  { id: "part", weeks: 26, months: 6 },
];

const DEFAULT_SHARE: YearShare = "most";
const DEFAULT_WEEKS = 40;
const WEEKS_IN_YEAR = 52;

/** Weeks in a report period, counting both its first and last day. */
export function weeksInPeriod(period: { startDate: string; endDate: string }): number {
  const days = (Date.parse(period.endDate) - Date.parse(period.startDate)) / 86_400_000 + 1;
  return Math.max(1, Math.round(days / 7));
}

/**
 * The share of the year means nothing for a report of a few months, so a period
 * shorter than the "nearly all year" preset is counted in full instead.
 */
export function isShortPeriod(reportWeeks: number): boolean {
  return reportWeeks < YEAR_SHARE_PRESETS[0].weeks;
}

export interface HoursBasis {
  period: HoursPeriod;
  /** Hours per `period`. */
  amount: number;
  share: YearShare;
  /** Weeks a year when `share` is "custom", also used to show it in months. */
  customWeeks: number;
}

// Small amounts keep a second decimal, or 2 hours a year would become 0.1 a week.
const roundAmount = (n: number) => n < 1 ? Math.round(n * 100) / 100 : Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** How many weeks (or months, for a monthly answer) the answer covers. */
export function activeCount(basis: Pick<HoursBasis, "period" | "share" | "customWeeks">): number {
  const preset = YEAR_SHARE_PRESETS.find(p => p.id === basis.share);
  if (basis.period === "month") return preset ? preset.months : Math.round(basis.customWeeks * 12 / 52);
  return preset ? preset.weeks : basis.customWeeks;
}

export function annualHours(basis: HoursBasis): number {
  if (basis.period === "year") return Math.round(basis.amount);
  return Math.round(basis.amount * activeCount(basis));
}

/**
 * The starting point for an annual figure with no basis yet. A figure that is
 * still the question's starting value is asked for by the week; anything else
 * is a real answer, from a saved report say, and stays as the yearly number.
 */
export function basisFromAnnual(annual: number, startingValue = 0, reportWeeks = WEEKS_IN_YEAR): HoursBasis {
  const answered = annual !== startingValue;
  const weeks = isShortPeriod(reportWeeks) ? reportWeeks : DEFAULT_WEEKS;
  return {
    period: answered ? "year" : "week",
    amount: answered ? annual : roundAmount(annual / weeks),
    share: isShortPeriod(reportWeeks) ? "custom" : DEFAULT_SHARE,
    customWeeks: weeks,
  };
}

/** Re-expresses the answer in another period, keeping the annual total. */
export function changePeriod(basis: HoursBasis, annual: number, period: HoursPeriod): HoursBasis {
  const next = { ...basis, period };
  if (period === "year") return { ...next, amount: annual };
  const count = activeCount(next);
  return count > 0 ? { ...next, amount: roundAmount(annual / count) } : next;
}

/** Sets a custom count, given in the units of the current period. */
export function withCustomCount(basis: HoursBasis, count: number): HoursBasis {
  const weeks = basis.period === "month" ? Math.round(clamp(count, 0, 12) * 52 / 12) : clamp(count, 0, 52);
  return { ...basis, share: "custom", customWeeks: weeks };
}

/** Drops "each year" and similar from a question answered in hours, keeping "twice a year". */
export function withoutYearPhrase(question: string): string {
  return question
    .replace(/\b(hours) (?:per|a|each|every) year\b/i, "$1")
    .replace(/(\S+)\s+(?:(?:this|each|every|per|a) year|annually)\b/i, (phrase, word: string) =>
      /^(?:once|twice|times)$/i.test(word) ? phrase : word);
}
