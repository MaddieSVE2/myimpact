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
  userId?: string | null;
  kind?: string | null;
  entryDate: Date;
  reportingYear?: number | null;
  resultJson: unknown;
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

interface ActivityAgg {
  activityName: string;
  category: string;
  sdg: string;
  sdgColor: string;
  estimatedValue: number;
  loggedValue: number;
  estimatedHours: number;
  loggedHours: number;
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
): ReconciliationResult {
  // group key: user|year → activityId → aggregate
  const groups = new Map<string, { user: string; year: number; acts: Map<string, ActivityAgg>; estDonations: number; logDonations: number }>();

  for (const r of records) {
    const kind = r.kind ?? "legacy";
    if (kind !== "annual_estimate" && kind !== "quick_log") continue;
    const isEstimate = kind === "annual_estimate";
    const year = r.reportingYear ?? deriveReportingYear(r.entryDate);
    if (year === null) continue; // unassociated records are summed as-is
    const user = r.userId ?? "";
    const key = `${user}|${year}`;
    let g = groups.get(key);
    if (!g) {
      g = { user, year, acts: new Map(), estDonations: 0, logDonations: 0 };
      groups.set(key, g);
    }

    const result = r.resultJson !== null && typeof r.resultJson === "object"
      ? (r.resultJson as Record<string, unknown>)
      : {};
    const donations = num(result.donationsValue);
    if (isEstimate) g.estDonations += donations;
    else g.logDonations += donations;

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
        };
        g.acts.set(activityId, a);
      }
      if (isEstimate) {
        a.estimatedValue += num(b.impactValue);
        a.estimatedHours += num(b.hours);
      } else {
        a.loggedValue += num(b.impactValue);
        a.loggedHours += num(b.hours);
      }
    }
  }

  let impactExcess = 0;
  let hoursExcess = 0;
  let donationExcess = 0;
  const activities: ReconciledActivity[] = [];

  for (const g of groups.values()) {
    donationExcess += Math.min(g.estDonations, g.logDonations);
    for (const [activityId, a] of g.acts) {
      const hasBoth =
        (a.estimatedValue > 0 || a.estimatedHours > 0) &&
        (a.loggedValue > 0 || a.loggedHours > 0);
      if (!hasBoth) continue;
      const excessValue = Math.min(a.estimatedValue, a.loggedValue);
      const excessHours = Math.min(a.estimatedHours, a.loggedHours);
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

  // Excluded hours also carry their contribution + personal-development
  // components inside totalValue.
  const valueExcess =
    impactExcess +
    donationExcess +
    hoursExcess * (VOLUNTEER_RATE + PERSONAL_DEV_RATE_PER_HOUR);

  return {
    valueExcess,
    hoursExcess,
    donationExcess,
    activities,
  };
}
