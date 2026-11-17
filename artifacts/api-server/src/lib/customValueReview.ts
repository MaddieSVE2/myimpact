/**
 * Saved activities described in someone's own words whose value doesn't
 * stand up. Until the matcher was tightened (lib/proxyMatch.ts) the AI was
 * shown proxies that merely shared letters with the description, its pick
 * was applied to each item whatever the proxy is priced per, and every item
 * was given two hours of volunteering: 75 reused carrier bags came to
 * £16,000.
 *
 * Pure planning here, so it can be tested; the admin route
 * (routes/admin-custom-values.ts) loads, lists and saves. A corrected line
 * stays on the member's record with no value, and keeps what it was saved
 * with under `valueRemoved`.
 */
import type { StoredProxy } from "./proxyStore.js";
import { DEFAULT_HOURS_PER_UNIT, proxySharesWord, unitFitsProxy } from "./proxyMatch.js";
import { contributionRate, PERSONAL_DEV_RATE_PER_HOUR } from "./contributionModel.js";
import { retotalResult } from "./resultTotals.js";

/** A proxy value this large on one line is listed to be checked by eye. */
const LARGE_VALUE = 1000;

export type ReviewReason =
  /** The proxy's title has no word in common with the description. */
  | "unrelated"
  /** The proxy is priced per something other than what was counted. */
  | "unit"
  /** Two hours of volunteering assumed for each item. */
  | "hours"
  /** Nothing found wrong, but a large value worth a look. */
  | "large";

export interface ReviewRecord {
  id: number;
  entryDate: Date;
  resultJson: unknown;
  /** An organisation's copy of an entry a member shared. */
  isOrgCopy: boolean;
}

export interface ReviewLine {
  recordId: number;
  /** Position among the entry's activity lines. */
  index: number;
  activityId: string;
  entryDate: string;
  isOrgCopy: boolean;
  name: string;
  proxy: string;
  /** What the proxy is priced per, in its own words. */
  proxyUnit: string;
  unit: string;
  quantity: number;
  hours: number;
  reason: ReviewReason;
  /** Found wrong by the rules (a "large" line is only listed). */
  suggested: boolean;
  removesValue: boolean;
  removesHours: boolean;
  /** The line's share of the entry's total: its value and its hours' value. */
  before: number;
  after: number;
}

type Breakdown = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const round2 = (n: number) => Math.round(n * 100) / 100;

const breakdownsOf = (result: Record<string, unknown>): Breakdown[] =>
  (Array.isArray(result.activityBreakdowns) ? result.activityBreakdowns : []).filter(
    (b): b is Breakdown => !!b && typeof b === "object",
  );

function isCustom(b: Breakdown): boolean {
  return b.category === "Custom" || str(b.activityId).startsWith("custom");
}

/** Hours nobody entered: the old two for each session, person or item. */
function hoursWereAssumed(unit: string, quantity: number, hours: number): boolean {
  if (!unit || unit === "hour" || unit === "pound" || hours <= 0) return false;
  return hours === Math.max(1, Math.round(quantity * DEFAULT_HOURS_PER_UNIT));
}

function reviewLine(b: Breakdown, proxies: ReadonlyMap<string, StoredProxy>) {
  const unit = str(b.unit);
  // Money given or raised counts pound for pound, with no proxy involved.
  if (unit === "pound") return null;
  const name = str(b.activityName);
  const value = num(b.impactValue);
  const assumed = hoursWereAssumed(unit, num(b.quantity), num(b.hours));
  const proxy = value > 0 ? proxies.get(str(b.proxy)) : undefined;

  let reason: ReviewReason;
  if (proxy && !proxySharesWord(proxy.title, name)) reason = "unrelated";
  // Only the unit was saved, not the question asked, so a description that
  // names what the proxy is priced per ("two tonnes of food") also fits.
  else if (proxy && unit && !unitFitsProxy(proxy, unit, `${unit} ${name}`)) reason = "unit";
  // Sessions and people helped take time; a count of things says nothing
  // about time.
  else if (assumed && unit === "item") reason = "hours";
  else if (value >= LARGE_VALUE) reason = "large";
  else return null;

  return {
    reason,
    suggested: reason !== "large",
    removesValue: reason !== "hours" && value > 0,
    // A number counted in the wrong thing can't say how long it took either.
    removesHours: assumed,
    proxyUnit: proxy?.unit.trim() ?? "",
  };
}

/** Every custom line worth correcting or checking, largest reduction first. */
export function reviewCustomLines(records: ReviewRecord[], proxies: ReadonlyMap<string, StoredProxy>): ReviewLine[] {
  const lines: ReviewLine[] = [];
  for (const record of records) {
    const result = (record.resultJson && typeof record.resultJson === "object" ? record.resultJson : {}) as Record<string, unknown>;
    const hourValue = contributionRate(result) + PERSONAL_DEV_RATE_PER_HOUR;
    breakdownsOf(result).forEach((b, index) => {
      if (!isCustom(b)) return;
      const found = reviewLine(b, proxies);
      if (!found) return;
      const value = num(b.impactValue);
      const hours = num(b.hours);
      lines.push({
        recordId: record.id,
        index,
        activityId: str(b.activityId),
        entryDate: record.entryDate.toISOString().slice(0, 10),
        isOrgCopy: record.isOrgCopy,
        name: str(b.activityName),
        proxy: str(b.proxy),
        unit: str(b.unit),
        quantity: num(b.quantity),
        hours,
        ...found,
        before: round2(value + hours * hourValue),
        after: round2((found.removesValue ? 0 : value) + (found.removesHours ? 0 : hours) * hourValue),
      });
    });
  }
  return lines.sort(
    (a, b) => Number(b.suggested) - Number(a.suggested) || b.before - b.after - (a.before - a.after) || a.recordId - b.recordId,
  );
}

/** The saved result with these lines of it corrected and its totals recomputed. */
export function correctResult(result: Record<string, unknown>, lines: ReviewLine[], at = new Date()) {
  const byIndex = new Map(lines.map((l) => [l.index, l]));
  let hoursRemoved = 0;
  const breakdowns = breakdownsOf(result).map((b, index) => {
    const line = byIndex.get(index);
    // The entry may have been edited since the list was drawn up.
    if (!line || str(b.activityId) !== line.activityId) return b;
    const fixed: Breakdown = {
      ...b,
      valueRemoved: {
        at: at.toISOString(),
        reason: line.reason,
        proxy: str(b.proxy),
        proxyYear: str(b.proxyYear),
        valuePerUnit: num(b.valuePerUnit),
        impactValue: num(b.impactValue),
        hours: num(b.hours),
      },
    };
    if (line.removesValue) Object.assign(fixed, { proxy: "", proxyYear: "", valuePerUnit: 0, impactValue: 0 });
    if (line.removesHours) {
      hoursRemoved += num(b.hours);
      fixed.hours = 0;
    }
    return fixed;
  });
  return retotalResult(
    result,
    breakdowns as Array<{ sdg?: string; sdgColor?: string; impactValue?: number }>,
    Math.max(0, num(result.totalHours) - hoursRemoved),
  );
}
