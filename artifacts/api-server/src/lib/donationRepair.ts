// Monetary donation detection + repair of historic inflated records.
//
// Money donations must be valued 1:1 with the amount given (annualised from
// the stated period), never matched to an hourly/weekly proxy — otherwise
// "£72 a year" can get inflated into a weekly habit (£72 × 48 weeks).
// New entries are handled at analyse time (see routes/custom-activity.ts);
// repairInflatedDonations fixes records saved before that fix.

const FUNDRAISING_RE = /fund[\s-]?rais/i;
const MONEY_RE = /£\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:pounds?|quid|gbp)\b/i;
const DONATION_CUE_RE = /\bdonat\w*|\bgiv(?:e|es|ing)\b|\bgave\b|\bsponsor\w*|\btithe\w*|\bto\s+(?:\w+\s+){0,3}?(?:charit\w*|church|mosque|temple|good\s+cause|cause\b)/i;

export interface ParsedDonation {
  annualAmount: number;
}

export function parseDonation(name: string): ParsedDonation | null {
  if (FUNDRAISING_RE.test(name)) return null;
  if (!DONATION_CUE_RE.test(name)) return null;
  const money = name.match(MONEY_RE);
  if (!money) return null;
  const amount = parseFloat((money[1] ?? money[2] ?? "").replace(/,/g, ""));
  if (!isFinite(amount) || amount <= 0) return null;

  let multiplier = 1; // default: treat the stated amount as the annual total
  if (/\b(?:per|a|each|every)\s+week\b|\bweekly\b/i.test(name)) multiplier = 52;
  else if (/\bfortnight\w*\b/i.test(name)) multiplier = 26;
  else if (/\b(?:per|a|each|every)\s+month\b|\bmonthly\b/i.test(name)) multiplier = 12;
  else if (/\b(?:per|a|each|every)\s+(?:year|annum)\b|\bannually\b|\byearly\b|\bp\.?a\.?\b/i.test(name)) multiplier = 1;
  else if (/\b(?:per|a|each|every)\s+day\b|\bdaily\b/i.test(name)) multiplier = 365;

  return { annualAmount: Math.round(amount * multiplier * 100) / 100 };
}

interface BreakdownLike {
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
  unitLabel?: string;
}

const VOLUNTEER_RATE = 12.21;          // keep in sync with calculateImpact
const PERSONAL_DEV_RATE_PER_HOUR = 15; // keep in sync with calculateImpact

const round2 = (n: number) => Math.round(n * 100) / 100;

// A custom breakdown is "inflated" when its name describes a monetary
// donation but it was valued via a non-pound proxy and its stored value
// overstates the annualised amount the user described.
export function isInflatedDonationBreakdown(b: BreakdownLike): number | null {
  const name = typeof b.activityName === "string" ? b.activityName : "";
  if (!name) return null;
  const isCustom = b.category === "Custom" || String(b.activityId ?? "").startsWith("custom");
  if (!isCustom) return null;
  // Already pound-for-pound — nothing to fix.
  if (b.unit === "pound" && (b.valuePerUnit == null || b.valuePerUnit === 1)) return null;
  const parsed = parseDonation(name);
  if (!parsed) return null;
  const stored = typeof b.impactValue === "number" ? b.impactValue : 0;
  // Only flag genuinely overstated records (allow small rounding slack).
  if (stored <= parsed.annualAmount + 0.01) return null;
  return parsed.annualAmount;
}

// Rewrites inflated donation breakdowns in a saved impact result to
// pound-for-pound values and recomputes all derived totals. Returns null
// when nothing needed fixing; otherwise the repaired result object.
export function repairInflatedDonations(result: Record<string, unknown>): Record<string, unknown> | null {
  const breakdowns = Array.isArray(result.activityBreakdowns)
    ? (result.activityBreakdowns as BreakdownLike[])
    : [];
  let removedHours = 0;
  let changed = false;

  const fixed = breakdowns.map((b) => {
    const annualAmount = isInflatedDonationBreakdown(b);
    if (annualAmount == null) return b;
    changed = true;
    removedHours += typeof b.hours === "number" ? b.hours : 0;
    return {
      ...b,
      impactValue: annualAmount,
      quantity: annualAmount,
      valuePerUnit: 1,
      unit: "pound",
      unitLabel: "pounds donated per year",
      hours: 0,
      proxy: "Money donated to charity — counted pound for pound",
      proxyYear: "",
    };
  });

  if (!changed) return null;

  const oldTotalHours = typeof result.totalHours === "number" ? result.totalHours : 0;
  const totalHours = Math.max(0, oldTotalHours - removedHours);
  const impactValue = fixed.reduce((sum, b) => sum + (typeof b.impactValue === "number" ? b.impactValue : 0), 0);
  const donationsValue = typeof result.donationsValue === "number" ? result.donationsValue : 0;
  const contributionValue = totalHours * VOLUNTEER_RATE;
  const personalDevelopmentValue = totalHours * PERSONAL_DEV_RATE_PER_HOUR;
  const totalValue = impactValue + contributionValue + donationsValue + personalDevelopmentValue;

  const sdgMap = new Map<string, { sdg: string; sdgColor: string; value: number }>();
  for (const b of fixed) {
    const sdg = b.sdg ?? "Good Health and Well-Being";
    if (!sdgMap.has(sdg)) {
      sdgMap.set(sdg, { sdg, sdgColor: b.sdgColor ?? "#4C9F38", value: 0 });
    }
    sdgMap.get(sdg)!.value += typeof b.impactValue === "number" ? b.impactValue : 0;
  }
  const sdgBreakdowns = Array.from(sdgMap.values()).map((s) => ({ ...s, value: round2(s.value) }));

  return {
    ...result,
    activityBreakdowns: fixed,
    totalHours,
    impactValue: round2(impactValue),
    contributionValue: round2(contributionValue),
    donationsValue: round2(donationsValue),
    personalDevelopmentValue: round2(personalDevelopmentValue),
    totalValue: round2(totalValue),
    sdgBreakdowns,
  };
}
