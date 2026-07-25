/**
 * Timescale preset helpers for the "when did this happen?" date picker.
 *
 * All date arithmetic is done in local time (matching how the raw <input type="date">
 * works) and the result is an ISO YYYY-MM-DD string, capped at today.
 *
 * UK academic term boundaries (per product spec):
 *   Spring  Jan–Mar  (months 1–3)
 *   Summer  Apr–Jul  (months 4–7)
 *   Autumn  Sep–Dec  (months 9–12)
 *
 * August is a gap between Summer and Autumn terms.  When the reference date
 * falls in August the "current" term is treated as Summer (most recently
 * ended), so "This term" resolves to the last day of July.
 */

export type TimescalePresetId =
  | "today"
  | "this_month"
  | "last_month"
  | "this_term"
  | "last_term"
  | "this_year"
  | "ongoing"
  | "custom";

export interface TimescalePreset {
  id: TimescalePresetId;
  label: string;
}

export const TIMESCALE_PRESETS: TimescalePreset[] = [
  { id: "today",      label: "Today" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_term",  label: "This term" },
  { id: "last_term",  label: "Last term" },
  { id: "this_year",  label: `This year (${new Date().getFullYear()})` },
  { id: "ongoing",    label: "Ongoing" },
  { id: "custom",     label: "Custom date" },
];

interface TermDef {
  name: string;
  startMonth: number;
  endMonth: number;
}

// August (8) is not in any term — see module doc.
const TERMS: TermDef[] = [
  { name: "Spring", startMonth: 1, endMonth: 3 },
  { name: "Summer", startMonth: 4, endMonth: 7 },
  { name: "Autumn", startMonth: 9, endMonth: 12 },
];

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOf(year: number, month: number): number {
  // new Date(year, month, 0) → last day of month-1 in local time
  return new Date(year, month, 0).getDate();
}

function localTodayIso(now: Date): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Returns the term that is current (or most-recently-ended) for the given month.
 * August resolves to Summer (ended Jul 31).
 */
function activeTerm(month: number): { term: TermDef; ended: boolean } {
  const inTerm = TERMS.find((t) => month >= t.startMonth && month <= t.endMonth);
  if (inTerm) return { term: inTerm, ended: false };
  // August gap: most recently ended term is Summer
  return { term: TERMS[1]!, ended: true };
}

function prevTerm(term: TermDef, year: number): { term: TermDef; year: number } {
  const idx = TERMS.indexOf(term);
  if (idx === 0) return { term: TERMS[2]!, year: year - 1 };
  return { term: TERMS[idx - 1]!, year };
}

/**
 * Resolves a preset id to an ISO date string, or null for "ongoing"/"custom".
 * The result is always capped at today; future dates are never produced.
 */
export function resolvePresetDate(
  id: TimescalePresetId,
  now: Date = new Date()
): string | null {
  if (id === "ongoing" || id === "custom") return null;

  const today = localTodayIso(now);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const cap = (iso: string) => (iso > today ? today : iso);

  switch (id) {
    case "today":
      return today;

    case "this_month":
      return today;

    case "last_month": {
      const lm = month === 1 ? 12 : month - 1;
      const ly = month === 1 ? year - 1 : year;
      return cap(toIso(ly, lm, lastDayOf(ly, lm)));
    }

    case "this_term": {
      const { term, ended } = activeTerm(month);
      const termEnd = toIso(year, term.endMonth, lastDayOf(year, term.endMonth));
      if (ended || termEnd < today) return cap(termEnd);
      return today;
    }

    case "last_term": {
      const { term } = activeTerm(month);
      const { term: prev, year: py } = prevTerm(term, year);
      return cap(toIso(py, prev.endMonth, lastDayOf(py, prev.endMonth)));
    }

    // "This year" — the entry counts toward the current calendar year.
    // The natural resolution is 31 Dec, but future dates are never
    // produced, so this caps at today (which is always within the year).
    case "this_year":
      return cap(toIso(year, 12, 31));

    default:
      return today;
  }
}

/**
 * Returns the human-readable name of the current (or most-recently-ended) UK
 * academic term for a given date.  e.g. "Summer Term 2026"
 */
export function currentTermLabel(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { term } = activeTerm(month);
  return `${term.name} Term ${year}`;
}

/**
 * Returns the human-readable name of the previous UK academic term.
 * e.g. "Spring Term 2026"
 */
export function lastTermLabel(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { term } = activeTerm(month);
  const { term: prev, year: py } = prevTerm(term, year);
  return `${prev.name} Term ${py}`;
}
