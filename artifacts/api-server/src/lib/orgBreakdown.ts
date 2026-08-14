import { ACTIVITIES } from "./impactData.js";

/**
 * Org reporting breakdowns over shared impact records.
 *
 * Groups records (or their activity lines) by one dimension using the
 * contribution-model fields that now exist on every record: the activity
 * date (`entry_date`) and the structured location (`location_json`, with
 * the flat `region`/`outward_code` columns as legacy fallback).
 *
 * Every dimension reports the same metrics as the monthly view: the full
 * stored record totals (allocated pro-rata across activity lines for the
 * category/sdg/proxy dimensions — see computeOrgBreakdown). The
 * estimate-vs-actual reconciliation excess cannot be
 * attributed to a single month/town/etc., so it is returned separately as
 * a top-level adjustment for the caller to surface (see
 * docs/org-visibility-and-verification.md).
 */

export const BREAKDOWN_DIMENSIONS = [
  "month",
  "town",
  "postcode_area",
  "local_authority",
  "region",
  "category",
  "sdg",
  "proxy",
] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export function parseBreakdownDimension(raw: unknown): BreakdownDimension | null {
  return typeof raw === "string" && (BREAKDOWN_DIMENSIONS as readonly string[]).includes(raw)
    ? (raw as BreakdownDimension)
    : null;
}

interface LocationJson {
  postcode?: unknown;
  townCity?: unknown;
  localAuthority?: unknown;
  region?: unknown;
}

export interface BreakdownRecord {
  userId: string;
  entryDate: Date;
  region: string | null;
  outwardCode: string | null;
  locationJson: unknown;
  resultJson: unknown;
}

export interface BreakdownRow {
  key: string;
  label: string;
  records: number;
  members: number;
  hours: number;
  valueGBP: number;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNKNOWN = "Unknown";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function loc(r: BreakdownRecord): LocationJson {
  return r.locationJson !== null && typeof r.locationJson === "object" ? (r.locationJson as LocationJson) : {};
}

/** "SW1A 1AA" / "SW1A" → postcode area "SW"; null when nothing usable. */
export function postcodeArea(outwardOrPostcode: string | null): string | null {
  if (!outwardOrPostcode) return null;
  const m = /^([A-Za-z]{1,2})\d/.exec(outwardOrPostcode.trim());
  return m ? m[1].toUpperCase() : null;
}

function recordKey(r: BreakdownRecord, dimension: BreakdownDimension): { key: string; label: string } {
  const l = loc(r);
  switch (dimension) {
    case "month": {
      const d = new Date(r.entryDate);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return { key, label: `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
    }
    case "town": {
      const town = str(l.townCity) ?? UNKNOWN;
      return { key: town, label: town };
    }
    case "postcode_area": {
      const area = postcodeArea(str(l.postcode) ?? r.outwardCode) ?? UNKNOWN;
      return { key: area, label: area };
    }
    case "local_authority": {
      const la = str(l.localAuthority) ?? UNKNOWN;
      return { key: la, label: la };
    }
    case "region": {
      const region = str(l.region) ?? str(r.region) ?? UNKNOWN;
      return { key: region, label: region };
    }
    default:
      return { key: UNKNOWN, label: UNKNOWN };
  }
}

interface StoredBreakdownLine {
  activityId?: unknown;
  category?: unknown;
  sdg?: unknown;
  proxy?: unknown;
  impactValue?: unknown;
  hours?: unknown;
}

function storedLines(r: BreakdownRecord): StoredBreakdownLine[] {
  const rj = r.resultJson;
  if (rj === null || typeof rj !== "object") return [];
  const arr = (rj as { activityBreakdowns?: unknown }).activityBreakdowns;
  return Array.isArray(arr) ? (arr as StoredBreakdownLine[]) : [];
}

function storedTotals(r: BreakdownRecord): { hours: number; value: number } {
  const rj = r.resultJson;
  if (rj === null || typeof rj !== "object") return { hours: 0, value: 0 };
  const o = rj as { totalHours?: unknown; totalValue?: unknown };
  return {
    hours: typeof o.totalHours === "number" ? o.totalHours : 0,
    value: typeof o.totalValue === "number" ? o.totalValue : 0,
  };
}

const PROXY_BY_ACTIVITY = new Map(ACTIVITIES.map(a => [a.id, a.proxy]));

/**
 * Group records by the requested dimension.
 *
 * Record-level dimensions (month/location) sum each record's stored
 * `totalHours`/`totalValue` directly.
 *
 * Line-level dimensions (category/sdg/proxy) must report the SAME metrics,
 * so each record's stored totals are fully allocated across its activity
 * lines rather than summing raw line values (which exclude contribution,
 * personal-development and donation value, and any additional volunteer
 * hours). Allocation rule: value is split pro-rata by each line's
 * `impactValue` (equal split when all line impact values are zero); hours
 * pro-rata by line `hours` (equal split when all are zero). Records with no
 * lines at all fall into "Unknown". This guarantees every dimension's
 * column totals sum to the same organisation-wide figures as the month view.
 */
export function computeOrgBreakdown(records: BreakdownRecord[], dimension: BreakdownDimension): BreakdownRow[] {
  const groups = new Map<string, { label: string; recordIds: Set<BreakdownRecord>; members: Set<string>; hours: number; value: number }>();

  const add = (key: string, label: string, r: BreakdownRecord, hours: number, value: number) => {
    let g = groups.get(key);
    if (!g) {
      g = { label, recordIds: new Set(), members: new Set(), hours: 0, value: 0 };
      groups.set(key, g);
    }
    g.recordIds.add(r);
    g.members.add(r.userId);
    g.hours += hours;
    g.value += value;
  };

  const lineLevel = dimension === "category" || dimension === "sdg" || dimension === "proxy";

  for (const r of records) {
    if (!lineLevel) {
      const { key, label } = recordKey(r, dimension);
      const totals = storedTotals(r);
      add(key, label, r, totals.hours, totals.value);
      continue;
    }
    const lines = storedLines(r);
    const totals = storedTotals(r);
    if (lines.length === 0) {
      // No line detail — attribute the whole record to Unknown so the
      // dimension still accounts for the full organisation totals.
      add(UNKNOWN, UNKNOWN, r, totals.hours, totals.value);
      continue;
    }
    const lineValue = (l: StoredBreakdownLine) => (typeof l.impactValue === "number" ? l.impactValue : 0);
    const lineHours = (l: StoredBreakdownLine) => (typeof l.hours === "number" ? l.hours : 0);
    const valueSum = lines.reduce((s, l) => s + lineValue(l), 0);
    const hoursSum = lines.reduce((s, l) => s + lineHours(l), 0);
    for (const line of lines) {
      let key: string;
      if (dimension === "category") {
        key = str(line.category) ?? UNKNOWN;
      } else if (dimension === "sdg") {
        key = str(line.sdg) ?? UNKNOWN;
      } else {
        const activityId = str(line.activityId);
        key = str(line.proxy) ?? (activityId ? PROXY_BY_ACTIVITY.get(activityId) : null) ?? UNKNOWN;
      }
      // Allocate the record's stored totals pro-rata across its lines so
      // line-level dimensions report the same social value / hours metrics
      // as the record-level views (see function docstring).
      const valueShare = valueSum > 0 ? lineValue(line) / valueSum : 1 / lines.length;
      const hoursShare = hoursSum > 0 ? lineHours(line) / hoursSum : 1 / lines.length;
      add(key, key, r, totals.hours * hoursShare, totals.value * valueShare);
    }
  }

  const entries = Array.from(groups.entries());
  const hoursRounded = roundConserving(entries.map(([, g]) => g.hours));
  const valuesRounded = roundConserving(entries.map(([, g]) => g.value));
  return entries
    .map(([key, g], i) => ({
      key,
      label: g.label,
      records: g.recordIds.size,
      members: g.members.size,
      hours: hoursRounded[i],
      valueGBP: valuesRounded[i],
    }))
    .sort((a, b) => (dimension === "month" ? a.key.localeCompare(b.key) : b.valueGBP - a.valueGBP));
}

/**
 * Round each value to 2 decimals while conserving the (2-decimal-rounded)
 * total exactly — largest-remainder method. Without this, per-group rounding
 * drifts from the organisation-wide totals (e.g. £1 split three ways would
 * display as 3 × £0.33 = £0.99). Remainder pennies are assigned
 * deterministically to the entries with the largest fractional remainders
 * (ties broken by array order).
 */
function roundConserving(raw: number[]): number[] {
  const centsExact = raw.map(v => v * 100);
  const cents = centsExact.map(Math.round);
  const targetCents = Math.round(centsExact.reduce((s, v) => s + v, 0));
  let diff = targetCents - cents.reduce((s, v) => s + v, 0);
  if (diff !== 0) {
    const step = diff > 0 ? 1 : -1;
    // Order indices by how much rounding moved them against the needed direction.
    const order = centsExact
      .map((v, i) => ({ i, rem: (v - cents[i]) * step }))
      .sort((a, b) => b.rem - a.rem)
      .map(o => o.i);
    for (let k = 0; diff !== 0; k = (k + 1) % order.length) {
      cents[order[k]] += step;
      diff -= step;
    }
  }
  return cents.map(c => c / 100);
}
