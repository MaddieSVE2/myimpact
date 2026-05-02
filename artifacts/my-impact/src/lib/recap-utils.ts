const STORAGE_PREFIX = "mi-recap-viewed-";
const RECAP_WINDOW_START_MONTH = 10;
const RECAP_WINDOW_START_DAY = 15;
const RECAP_WINDOW_END_MONTH = 0;
const RECAP_WINDOW_END_DAY = 31;

export function getRecapYear(now: Date = new Date()): number {
  const month = now.getMonth();
  return month === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

export function isInRecapWindow(now: Date = new Date()): boolean {
  const month = now.getMonth();
  const day = now.getDate();
  if (month === RECAP_WINDOW_START_MONTH && day >= RECAP_WINDOW_START_DAY) return true;
  if (month === 11) return true;
  if (month === RECAP_WINDOW_END_MONTH && day <= RECAP_WINDOW_END_DAY) return true;
  return false;
}

export function isRecapViewed(year: number): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + year) === "true";
  } catch {
    return false;
  }
}

export function markRecapViewed(year: number): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + year, "true");
  } catch {}
}

export function clearRecapViewed(year: number): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + year);
  } catch {}
}

const VALUE_PREF_KEY = "mi-recap-show-money";

export function getShowMoneyPref(): boolean {
  try {
    const stored = localStorage.getItem(VALUE_PREF_KEY);
    if (stored === "false") return false;
  } catch {}
  return true;
}

export function setShowMoneyPref(value: boolean): void {
  try {
    localStorage.setItem(VALUE_PREF_KEY, String(value));
  } catch {}
}
