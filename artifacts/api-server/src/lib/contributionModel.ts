// Contribution data model helpers: record kinds, structured activity
// locations, reporting-period derivation, and the estimate-vs-actual
// reconciliation rule that prevents double-counting.
//
// Model (see docs/contribution-data-model.md):
//   - 'annual_estimate' rows are annualised Full Impact Report estimates.
//   - 'quick_log' rows are per-occurrence actuals (saved as-is).
//   - All other kinds ('legacy', 'recurring_confirmation',
//     'bulk_retrospective', 'org_api') are always summed unconditionally, so
//     historical data (all 'legacy') aggregates byte-identically to before.
//
// De-dup rule: within one (user, reporting year), when the SAME activity id
// appears in both an annual estimate and quick-logged actuals, the headline
// total counts that activity ONCE — the greater of estimated vs
// logged-so-far. Equivalently, we subtract the overlap
// min(estimated, logged) from the raw sum. Donations follow the same rule at
// the year level (estimated donations vs quick-logged donations).

export const RECORD_KINDS = [
  "legacy",
  "annual_estimate",
  "quick_log",
  "recurring_confirmation",
  "bulk_retrospective",
  "org_api",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

const KIND_SET = new Set<string>(RECORD_KINDS);

/** Parses a client-supplied record kind; returns null when absent/invalid. */
export function parseRecordKind(raw: unknown): RecordKind | null {
  return typeof raw === "string" && KIND_SET.has(raw) ? (raw as RecordKind) : null;
}

// Rates mirrored from calculateImpact (lib/impactData.ts). An hour excluded
// from the headline total must also surrender its contribution (NLW) and
// personal-development (£15/hr) components, since those are derived from
// hours inside every stored resultJson.totalValue.
const VOLUNTEER_RATE = 12.21;
const PERSONAL_DEV_RATE_PER_HOUR = 15;

// ── Activity location ──────────────────────────────────────────────────────

export const LOCATION_MODES = ["in_person", "online", "multiple"] as const;
export type LocationMode = (typeof LOCATION_MODES)[number];

export interface ActivityLocation {
  /** 'in_person' | 'online' (Online / remote) | 'multiple' (Multiple locations) */
  mode: LocationMode;
  label: string | null;
  postcode: string | null;
  townCity: string | null;
  lat: number | null;
  lng: number | null;
  localAuthority: string | null;
  region: string | null;
  country: string | null;
}

function cleanString(v: unknown, maxLen = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function cleanCoord(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/**
 * Normalises a client-supplied activity location into the stored shape.
 * Returns null when the input isn't a usable location object. "Online /
 * remote" and "Multiple locations" are valid values via `mode`.
 */
export function normalizeActivityLocation(raw: unknown): ActivityLocation | null {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const mode: LocationMode =
    typeof o.mode === "string" && (LOCATION_MODES as readonly string[]).includes(o.mode)
      ? (o.mode as LocationMode)
      : "in_person";
  const loc: ActivityLocation = {
    mode,
    label: cleanString(o.label),
    postcode: cleanString(o.postcode, 12),
    townCity: cleanString(o.townCity, 100),
    lat: cleanCoord(o.lat, -90, 90),
    lng: cleanCoord(o.lng, -180, 180),
    localAuthority: cleanString(o.localAuthority, 120),
    region: cleanString(o.region, 120),
    country: cleanString(o.country, 80),
  };
  // A lone default-mode object with no content is meaningless — treat as absent.
  const hasContent =
    mode !== "in_person" ||
    loc.label !== null || loc.postcode !== null || loc.townCity !== null ||
    loc.lat !== null || loc.lng !== null || loc.localAuthority !== null ||
    loc.region !== null || loc.country !== null;
  return hasContent ? loc : null;
}

/** General-area view of a location — safe to disclose to organisations. */
export interface OrgFacingLocation {
  mode: LocationMode;
  townCity: string | null;
  localAuthority: string | null;
  region: string | null;
  country: string | null;
  /** Letter prefix of the postcode area only (e.g. "SW"), never the full postcode. */
  postcodeArea: string | null;
}

/**
 * Redacts a stored activity location to the general area before it is sent
 * to organisations (webhook payloads, org APIs). The member-facing UI
 * promises that "only the general area is shared with organisations", so
 * this must never include the full postcode, free-text label/venue, or
 * lat/lng coordinates.
 */
export function redactLocationForOrg(raw: unknown): OrgFacingLocation | null {
  const loc = normalizeActivityLocation(raw);
  if (!loc) return null;
  const m = loc.postcode ? /^([A-Za-z]{1,2})\d/.exec(loc.postcode.trim()) : null;
  return {
    mode: loc.mode,
    townCity: loc.townCity,
    localAuthority: loc.localAuthority,
    region: loc.region,
    country: loc.country,
    postcodeArea: m ? m[1].toUpperCase() : null,
  };
}

// ── Reporting period ───────────────────────────────────────────────────────

/**
 * Derives the reporting period (calendar year today) a contribution counts
 * toward from its activity/entry date. Returns null when the date is invalid
 * or outside a sane window — the record still saves and can be associated
 * later. Designed so a richer Impact Report entity (e.g. academic years) can
 * replace this derivation without a schema change.
 */
export function deriveReportingYear(entryDate: Date | null | undefined): number | null {
  if (!(entryDate instanceof Date) || isNaN(entryDate.getTime())) return null;
  const y = entryDate.getUTCFullYear();
  return y >= 2000 && y <= 2100 ? y : null;
}

// ── Authoritative report period ────────────────────────────────────────────

export const REPORT_PERIOD_TYPES = ["calendar", "academic", "financial", "custom"] as const;
export type ReportPeriodType = (typeof REPORT_PERIOD_TYPES)[number];

export interface ReportPeriod {
  periodType: ReportPeriodType;
  /** Inclusive start, midnight UTC. */
  start: Date;
  /** Inclusive end, midnight UTC. */
  end: Date;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateUTC(raw: unknown): Date | null {
  if (typeof raw !== "string" || !ISO_DATE_RE.test(raw)) return null;
  const d = new Date(raw + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  // Strict calendar validation: JS normalizes impossible dates (2026-02-30
  // → 2 March), so require the parsed date to round-trip exactly.
  const [ys, ms, ds] = raw.split("-");
  if (
    d.getUTCFullYear() !== Number(ys) ||
    d.getUTCMonth() + 1 !== Number(ms) ||
    d.getUTCDate() !== Number(ds)
  ) {
    return null;
  }
  const y = d.getUTCFullYear();
  return y >= 2000 && y <= 2100 ? d : null;
}

const MAX_REPORT_PERIOD_DAYS = 400; // year-shaped periods, with slack

/**
 * Parses the client-supplied authoritative Full Impact Report period
 * ({ type, startDate, endDate } with inclusive ISO dates). Returns null when
 * absent or invalid — the record then saves with the legacy behaviour
 * (entryDate-derived reportingYear, no stored period), never an error.
 */
export function parseReportPeriod(raw: unknown): ReportPeriod | null {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const periodType =
    typeof o.type === "string" && (REPORT_PERIOD_TYPES as readonly string[]).includes(o.type)
      ? (o.type as ReportPeriodType)
      : null;
  const start = parseIsoDateUTC(o.startDate);
  const end = parseIsoDateUTC(o.endDate);
  if (!periodType || !start || !end) return null;
  if (end < start) return null;
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days > MAX_REPORT_PERIOD_DAYS) return null;
  return { periodType, start, end };
}

/**
 * Clamps a reference date (normally "now") into the report period so the
 * derived entryDate — which still drives calendar dashboards and
 * reconciliation grouping — always falls inside the authoritative period.
 */
export function clampDateToPeriod(reference: Date, period: ReportPeriod): Date {
  if (reference < period.start) return new Date(period.start);
  if (reference > period.end) return new Date(period.end);
  // Normalise to midnight UTC of the reference day.
  return new Date(Date.UTC(
    reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(),
  ));
}

/**
 * Default display name for a report period: "My Impact 2026" for periods
 * within one calendar year, "My Impact 2026/27" for cross-year (academic /
 * financial) periods. Display-only — never feeds dates or calculations.
 */
export function defaultReportName(period: ReportPeriod): string {
  const sy = period.start.getUTCFullYear();
  const ey = period.end.getUTCFullYear();
  return sy === ey ? `My Impact ${sy}` : `My Impact ${sy}/${String(ey % 100).padStart(2, "0")}`;
}

// ── Estimate vs actual reconciliation ─────────────────────────────────────

interface BreakdownEntry {
  activityId?: unknown;
  activityName?: unknown;
  category?: unknown;
  sdg?: unknown;
  sdgColor?: unknown;
  impactValue?: unknown;
  hours?: unknown;
}

export interface ReconcilableRecord {
  /** Record id — only needed for report-share dedupe (see sourceReportId). */
  id?: number | null;
  /**
   * Set on org submissions created by sharing a saved Full Impact Report.
   * When BOTH the share and its source report appear in the same input set
   * (personal aggregations), the share is a pure duplicate: its full
   * totals are added to the returned excess. When only one side is present
   * (org aggregates exclude the personal twin), nothing changes.
   */
  sourceReportId?: number | null;
  userId?: string | null;
  kind?: string | null;
  entryDate: Date;
  reportingYear?: number | null;
  resultJson: unknown;
  /**
   * Authoritative report period (annual_estimate rows saved by the wizard).
   * When present, reconciliation groups by this inclusive range instead of
   * the calendar reportingYear, so quick logs dated anywhere inside the
   * period (e.g. both sides of an academic-year boundary) reconcile against
   * the estimate. NULL/absent → legacy per-year grouping, unchanged.
   */
  reportStartDate?: Date | null;
  reportEndDate?: Date | null;
}

export interface ReconciledActivity {
  userId: string;
  year: number;
  activityId: string;
  activityName: string;
  category: string;
  sdg: string;
  sdgColor: string;
  estimatedValue: number;
  loggedValue: number;
  /** max(estimatedValue, loggedValue) — what the headline total counts. */
  countedValue: number;
  estimatedHours: number;
  loggedHours: number;
  countedHours: number;
  /** Overlap removed from the raw sum: min(estimated, logged). */
  excessValue: number;
  excessHours: number;
}

export interface ReconciliationResult {
  /**
   * Amount to subtract from the raw sum of resultJson.totalValue so each
   * activity (and donations) is counted once per user-year. Zero whenever no
   * user-year mixes annual estimates with quick-logged actuals — which makes
   * every historical aggregate byte-identical to the pre-reconciliation sum.
   */
  valueExcess: number;
  /** Amount to subtract from the raw sum of resultJson.totalHours. */
  hoursExcess: number;
  /** Donation overlap included inside valueExcess (already counted there). */
  donationExcess: number;
  /** Per-activity estimate-vs-logged detail (only activities present in BOTH). */
  activities: ReconciledActivity[];
}

interface LoggedEntry {
  t: number;
  value: number;
  hours: number;
  inWindow: boolean;
}

interface ActivityAgg {
  activityName: string;
  category: string;
  sdg: string;
  sdgColor: string;
  estimatedValue: number;
  loggedValue: number;
  estimatedHours: number;
  loggedHours: number;
  logEntries: LoggedEntry[];
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Computes the double-count adjustment for a set of impact records.
 * Aggregators keep their existing raw sums and subtract
 * `valueExcess` / `hoursExcess`. Records whose kind is anything other than
 * 'annual_estimate' or 'quick_log' never participate, so all-legacy datasets
 * always produce a zero adjustment.
 */
export function computeEstimateActualReconciliation(
  records: Iterable<ReconcilableRecord>,
  opts?: {
    /**
     * Aggregation window ([start, endExclusive)) whose raw sums the returned
     * excess will be subtracted from. Records outside the window act as
     * CONTEXT only: they consume estimate capacity (in chronological order of
     * quick-log dates) but contribute nothing to the returned excess. This
     * lets an estimate spanning two calendar years absorb each in-period
     * quick log exactly once across all windows — its capacity is never
     * reused per window. Omit for unwindowed aggregations (previous
     * behaviour, byte-identical).
     */
    window?: { start: Date; endExclusive: Date };
  },
): ReconciliationResult {
  const window = opts?.window;
  const inWindow = (d: Date): boolean =>
    !window || (d.getTime() >= window.start.getTime() && d.getTime() < window.endExclusive.getTime());
  // Group key: user|period (estimates with a stored report period, and the
  // quick logs whose entryDate falls inside it) or user|year (legacy).
  const groups = new Map<string, {
    user: string;
    year: number;
    acts: Map<string, ActivityAgg>;
    estDonations: number;
    logDonations: number;
    donEntries: { t: number; amount: number; inWindow: boolean }[];
  }>();

  const allRaw = Array.isArray(records) ? records : [...records];

  // Report-share dedupe: an org submission created by sharing a saved Full
  // Impact Report (sourceReportId set) is a byte-for-byte copy of (a subset
  // of) that report. When BOTH rows are in the input set — personal
  // aggregations, where the user's own report and their org share are each
  // selected — count the underlying activities once by treating the share's
  // full totals as excess and removing it from estimate/actual grouping.
  // Org aggregates never see both sides (the personal report is excluded as
  // a twin), so this pass is a no-op there.
  const presentIds = new Set<number>();
  for (const r of allRaw) {
    if (typeof r.id === "number") presentIds.add(r.id);
  }
  let duplicateValueExcess = 0;
  let duplicateHoursExcess = 0;
  // Per-activity share of the duplicate excess, so aggregators that adjust
  // activity/category/SDG maps via recon.activities dedupe those maps too,
  // not just the headline totals. Keyed by user|activityId.
  const duplicateActs = new Map<string, {
    userId: string;
    year: number;
    activityId: string;
    activityName: string;
    category: string;
    sdg: string;
    sdgColor: string;
    value: number;
    hours: number;
  }>();
  const all: ReconcilableRecord[] = [];
  for (const r of allRaw) {
    if (
      typeof r.sourceReportId === "number" &&
      presentIds.has(r.sourceReportId) &&
      r.sourceReportId !== r.id
    ) {
      if (!window || inWindow(r.entryDate)) {
        const result = r.resultJson !== null && typeof r.resultJson === "object"
          ? (r.resultJson as Record<string, unknown>)
          : {};
        duplicateValueExcess += num(result.totalValue);
        duplicateHoursExcess += num(result.totalHours);
        const breakdowns = Array.isArray(result.activityBreakdowns)
          ? (result.activityBreakdowns as BreakdownEntry[])
          : [];
        for (const b of breakdowns) {
          const activityId =
            typeof b.activityId === "string" && b.activityId
              ? b.activityId
              : typeof b.activityName === "string" && b.activityName
                ? b.activityName
                : "unknown";
          const userId = r.userId ?? "";
          const key = `${userId}|${activityId}`;
          let d = duplicateActs.get(key);
          if (!d) {
            d = {
              userId,
              year: r.entryDate.getUTCFullYear(),
              activityId,
              activityName: typeof b.activityName === "string" ? b.activityName : activityId,
              category: typeof b.category === "string" ? b.category : "Other",
              sdg: typeof b.sdg === "string" ? b.sdg : "",
              sdgColor: typeof b.sdgColor === "string" ? b.sdgColor : "#999",
              value: 0,
              hours: 0,
            };
            duplicateActs.set(key, d);
          }
          d.value += num(b.impactValue);
          d.hours += num(b.hours);
        }
      }
      continue; // never participates in estimate-vs-actual grouping
    }
    all.push(r);
  }

  // Pass 1: register each user's authoritative estimate periods so quick
  // logs can be matched to them regardless of calendar-year boundaries.
  const periodsByUser = new Map<string, { start: Date; end: Date; key: string }[]>();
  for (const r of all) {
    if ((r.kind ?? "legacy") !== "annual_estimate") continue;
    if (!(r.reportStartDate instanceof Date) || !(r.reportEndDate instanceof Date)) continue;
    const user = r.userId ?? "";
    const key = `${user}|P|${r.reportStartDate.toISOString()}|${r.reportEndDate.toISOString()}`;
    let list = periodsByUser.get(user);
    if (!list) { list = []; periodsByUser.set(user, list); }
    if (!list.some((p) => p.key === key)) {
      list.push({ start: r.reportStartDate, end: r.reportEndDate, key });
    }
  }
  // Inclusive end: a quick log dated on the period's last day still matches.
  const END_OF_DAY_MS = 86_400_000 - 1;
  const matchPeriod = (user: string, d: Date): string | null => {
    const list = periodsByUser.get(user);
    if (!list) return null;
    let best: { start: Date; key: string } | null = null;
    for (const p of list) {
      if (d.getTime() >= p.start.getTime() && d.getTime() <= p.end.getTime() + END_OF_DAY_MS) {
        if (!best || p.start > best.start) best = p; // most specific (latest-starting) period wins
      }
    }
    return best?.key ?? null;
  };

  for (const r of all) {
    const kind = r.kind ?? "legacy";
    if (kind !== "annual_estimate" && kind !== "quick_log") continue;
    const isEstimate = kind === "annual_estimate";
    const year = r.reportingYear ?? deriveReportingYear(r.entryDate);
    if (year === null) continue; // unassociated records are summed as-is
    const user = r.userId ?? "";
    // Estimates with an authoritative period group by that period; quick logs
    // join the period whose range contains their activity date. Everything
    // else keeps the legacy per-calendar-year grouping (historical rows have
    // no period, so their aggregates are byte-identical to before).
    const periodKey = isEstimate
      ? (r.reportStartDate instanceof Date && r.reportEndDate instanceof Date
          ? `${user}|P|${r.reportStartDate.toISOString()}|${r.reportEndDate.toISOString()}`
          : null)
      : matchPeriod(user, r.entryDate);
    const key = periodKey ?? `${user}|${year}`;
    let g = groups.get(key);
    if (!g) {
      g = { user, year, acts: new Map(), estDonations: 0, logDonations: 0, donEntries: [] };
      groups.set(key, g);
    }

    const recordInWindow = inWindow(r.entryDate);
    const result = r.resultJson !== null && typeof r.resultJson === "object"
      ? (r.resultJson as Record<string, unknown>)
      : {};
    const donations = num(result.donationsValue);
    if (isEstimate) {
      g.estDonations += donations;
    } else {
      g.logDonations += donations;
      if (donations > 0) {
        g.donEntries.push({ t: r.entryDate.getTime(), amount: donations, inWindow: recordInWindow });
      }
    }

    const breakdowns = Array.isArray(result.activityBreakdowns)
      ? (result.activityBreakdowns as BreakdownEntry[])
      : [];
    for (const b of breakdowns) {
      const activityId =
        typeof b.activityId === "string" && b.activityId
          ? b.activityId
          : typeof b.activityName === "string" && b.activityName
            ? b.activityName
            : "unknown";
      let a = g.acts.get(activityId);
      if (!a) {
        a = {
          activityName: typeof b.activityName === "string" ? b.activityName : activityId,
          category: typeof b.category === "string" ? b.category : "Other",
          sdg: typeof b.sdg === "string" ? b.sdg : "",
          sdgColor: typeof b.sdgColor === "string" ? b.sdgColor : "#999",
          estimatedValue: 0,
          loggedValue: 0,
          estimatedHours: 0,
          loggedHours: 0,
          logEntries: [],
        };
        g.acts.set(activityId, a);
      }
      if (isEstimate) {
        a.estimatedValue += num(b.impactValue);
        a.estimatedHours += num(b.hours);
      } else {
        a.loggedValue += num(b.impactValue);
        a.loggedHours += num(b.hours);
        a.logEntries.push({
          t: r.entryDate.getTime(),
          value: num(b.impactValue),
          hours: num(b.hours),
          inWindow: recordInWindow,
        });
      }
    }
  }

  let impactExcess = 0;
  let hoursExcess = 0;
  let donationExcess = 0;
  const activities: ReconciledActivity[] = [];

  for (const g of groups.values()) {
    // Estimate donation capacity is consumed by quick-log donations in
    // chronological order; only in-window consumption becomes excess, so
    // windowed callers never reuse the same capacity twice.
    let donCap = g.estDonations;
    for (const e of [...g.donEntries].sort((x, y) => x.t - y.t)) {
      const used = Math.min(donCap, e.amount);
      donCap -= used;
      if (e.inWindow) donationExcess += used;
      if (donCap <= 0) break;
    }
    for (const [activityId, a] of g.acts) {
      const hasBoth =
        (a.estimatedValue > 0 || a.estimatedHours > 0) &&
        (a.loggedValue > 0 || a.loggedHours > 0);
      if (!hasBoth) continue;
      // Chronological capacity consumption (value and hours independently).
      // Unwindowed callers see every entry as in-window, which reduces to the
      // old min(estimated, logged) — historical aggregates unchanged.
      let capV = a.estimatedValue;
      let capH = a.estimatedHours;
      let excessValue = 0;
      let excessHours = 0;
      for (const e of [...a.logEntries].sort((x, y) => x.t - y.t)) {
        const usedV = Math.min(capV, e.value);
        const usedH = Math.min(capH, e.hours);
        capV -= usedV;
        capH -= usedH;
        if (e.inWindow) {
          excessValue += usedV;
          excessHours += usedH;
        }
      }
      // An in-window estimate whose logs (anywhere in the period) exceed it
      // is itself the double-counted side: the counted total is the logged
      // side, so the estimate's overage is excess in its home window.
      impactExcess += excessValue;
      hoursExcess += excessHours;
      activities.push({
        userId: g.user,
        year: g.year,
        activityId,
        activityName: a.activityName,
        category: a.category,
        sdg: a.sdg,
        sdgColor: a.sdgColor,
        estimatedValue: round2(a.estimatedValue),
        loggedValue: round2(a.loggedValue),
        countedValue: round2(Math.max(a.estimatedValue, a.loggedValue)),
        estimatedHours: round2(a.estimatedHours),
        loggedHours: round2(a.loggedHours),
        countedHours: round2(Math.max(a.estimatedHours, a.loggedHours)),
        excessValue: round2(excessValue),
        excessHours: round2(excessHours),
      });
    }
  }

  // Fold the report-share duplicate excess into the per-activity detail so
  // activity/category/SDG adjustments dedupe alongside the headline totals.
  for (const d of duplicateActs.values()) {
    const existing = activities.find(
      (a) => a.userId === d.userId && a.activityId === d.activityId,
    );
    if (existing) {
      existing.excessValue = round2(existing.excessValue + d.value);
      existing.excessHours = round2(existing.excessHours + d.hours);
    } else {
      activities.push({
        userId: d.userId,
        year: d.year,
        activityId: d.activityId,
        activityName: d.activityName,
        category: d.category,
        sdg: d.sdg,
        sdgColor: d.sdgColor,
        estimatedValue: round2(d.value),
        loggedValue: round2(d.value),
        countedValue: round2(d.value),
        estimatedHours: round2(d.hours),
        loggedHours: round2(d.hours),
        countedHours: round2(d.hours),
        excessValue: round2(d.value),
        excessHours: round2(d.hours),
      });
    }
  }

  // Excluded hours also carry their contribution + personal-development
  // components inside totalValue.
  const valueExcess =
    impactExcess +
    donationExcess +
    hoursExcess * (VOLUNTEER_RATE + PERSONAL_DEV_RATE_PER_HOUR);

  return {
    valueExcess: valueExcess + duplicateValueExcess,
    hoursExcess: hoursExcess + duplicateHoursExcess,
    donationExcess,
    activities,
  };
}
