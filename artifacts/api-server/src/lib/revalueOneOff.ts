/**
 * Re-values one-off entries saved before f0f9fd4, when Quick Log, regular
 * activity occurrences and emailed activities valued yearly per-person
 * activities at a full year per entry, and household habits every time
 * (see ValuationOptions in impactData.ts). Pure planning here, so it can be
 * tested; the admin route (routes/admin-revalue.ts) loads and saves.
 */
import {
  calculateImpact,
  ONE_OFF_KINDS,
  YEARLY_HOUSEHOLD_ACTIVITY_IDS,
  YEARLY_PER_PERSON_ACTIVITY_IDS,
} from "./impactData.js";
import { extractActivityIds } from "./recordHelpers.js";

export interface RevalueRecord {
  id: number;
  userId: string;
  kind: string;
  entryDate: Date;
  activitiesJson: unknown;
  resultJson: unknown;
  donationsValue: string | number;
  totalValue: string | number;
  /** An organisation's copy of a shared entry (it mirrors the member's). */
  isOrgCopy: boolean;
}

export interface RevalueChange {
  id: number;
  userId: string;
  entryDate: Date;
  before: number;
  after: number;
  result: Record<string, unknown> & ReturnType<typeof calculateImpact>;
}

type Breakdown = {
  activityId?: string;
  activityName?: string;
  category?: string;
  proxy?: string;
  proxyYear?: string;
  sdg?: string;
  sdgColor?: string;
  impactValue?: number;
  hours?: number;
  quantity?: number;
  valuePerUnit?: number;
  unit?: string;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

function activitiesOf(record: RevalueRecord) {
  return (Array.isArray(record.activitiesJson) ? record.activitiesJson : [])
    .filter((a): a is { activityId: string; quantity?: unknown; hoursPerYear?: unknown } =>
      !!a && typeof a === "object" && typeof (a as { activityId?: unknown }).activityId === "string")
    .map((a) => ({ activityId: a.activityId, quantity: num(a.quantity), hoursPerYear: num(a.hoursPerYear) }));
}

/** Custom lines rebuilt from the stored breakdowns so they keep their value. */
function customActivitiesOf(result: Record<string, unknown>) {
  const breakdowns = (Array.isArray(result.activityBreakdowns) ? result.activityBreakdowns : []) as Breakdown[];
  return breakdowns
    .filter((b) => b && b.category === "Custom")
    .map((b) => {
      const hasPricing = typeof b.valuePerUnit === "number" && typeof b.quantity === "number" && typeof b.unit === "string";
      return {
        activityId: String(b.activityId ?? "custom"),
        name: String(b.activityName ?? "Custom activity"),
        quantity: hasPricing ? b.quantity! : 1,
        hoursPerYear: num(b.hours),
        // Older entries lack the pricing fields: keep their stored value.
        valuePerUnit: hasPricing ? b.valuePerUnit! : num(b.impactValue),
        unit: hasPricing ? b.unit! : "item",
        proxy: String(b.proxy ?? ""),
        proxyYear: String(b.proxyYear ?? ""),
        sdg: String(b.sdg ?? ""),
        sdgColor: String(b.sdgColor ?? ""),
      };
    });
}

/**
 * The changes to make, in order. Each member's one-off entries are taken by
 * date; within a calendar year, the first that includes a household habit
 * counts it and later ones add nothing (organisation copies mirror the
 * member's entry, so they never use up a household's year). Entries with
 * none of the yearly activities are left as they are.
 */
export function planRevaluation(records: RevalueRecord[]): RevalueChange[] {
  const ordered = records
    .filter((r) => ONE_OFF_KINDS.has(r.kind))
    .sort((a, b) => a.userId.localeCompare(b.userId) || a.entryDate.getTime() - b.entryDate.getTime() || a.id - b.id);
  const counted = new Map<string, Set<string>>(); // `${userId}:${year}` -> household ids
  const changes: RevalueChange[] = [];
  for (const record of ordered) {
    const ids = extractActivityIds(record.activitiesJson);
    if (!ids.some((id) => YEARLY_PER_PERSON_ACTIVITY_IDS.has(id) || YEARLY_HOUSEHOLD_ACTIVITY_IDS.has(id))) continue;
    const key = `${record.userId}:${record.entryDate.getUTCFullYear()}`;
    const countedThisYear = counted.get(key) ?? new Set<string>();
    counted.set(key, countedThisYear);

    const old = (record.resultJson && typeof record.resultJson === "object" ? record.resultJson : {}) as Record<string, unknown>;
    const activities = activitiesOf(record);
    const custom = customActivitiesOf(old);
    const lineHours = activities.reduce((s, a) => s + a.hoursPerYear, 0) + custom.reduce((s, a) => s + a.hoursPerYear, 0);
    const extraHours = Math.max(0, num(old.totalHours) - lineHours);
    const calc = calculateImpact(activities, num(record.donationsValue), extraHours, custom, {
      oneOff: true,
      householdsCountedThisYear: record.isOrgCopy ? new Set() : new Set(countedThisYear),
    });
    if (!record.isOrgCopy) for (const id of ids) if (YEARLY_HOUSEHOLD_ACTIVITY_IDS.has(id)) countedThisYear.add(id);

    const before = num(record.totalValue);
    if (Math.abs(calc.totalValue - before) < 0.01) continue;
    changes.push({
      id: record.id,
      userId: record.userId,
      entryDate: record.entryDate,
      before,
      after: calc.totalValue,
      // Keep everything else on the entry (sharing links, notes, sources).
      result: { ...old, ...calc, revaluedAt: new Date().toISOString() },
    });
  }
  return changes;
}

export function summarise(changes: RevalueChange[]) {
  const before = changes.reduce((s, c) => s + c.before, 0);
  const after = changes.reduce((s, c) => s + c.after, 0);
  return {
    entries: changes.length,
    members: new Set(changes.map((c) => c.userId)).size,
    before: Math.round(before * 100) / 100,
    after: Math.round(after * 100) / 100,
    largest: [...changes]
      .sort((a, b) => b.before - b.after - (a.before - a.after))
      .slice(0, 10)
      .map((c) => ({ id: c.id, entryDate: c.entryDate.toISOString().slice(0, 10), before: c.before, after: c.after })),
  };
}
