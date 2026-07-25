// Renders a per-activity calculation formula string like "48 hrs × £14.43/hr"
// from a saved activity breakdown. Returns "" when no rate is stored (older
// records saved before the formula infrastructure existed).
export function calcResultBreakdown(b: {
  unit?: string;
  unitLabel?: string;
  valuePerUnit?: number;
  quantity?: number;
  hours: number;
  impactValue: number;
}): string {
  const vpu = b.valuePerUnit;
  if (!vpu) return "";
  // Monetary entries (donations, funds raised) are valued pound-for-pound —
  // show the true annual amount rather than a misleading unit formula.
  if (b.unit === "pound") {
    const amount = b.quantity ?? Math.round(b.impactValue / vpu);
    return `£${amount.toLocaleString("en-GB")}/year`;
  }
  const rate = `£${vpu % 1 === 0 ? vpu.toFixed(0) : vpu.toFixed(2)}`;
  if (b.unit === "hour" || !b.unit) {
    return `${Math.round(b.hours).toLocaleString("en-GB")} hrs × ${rate}/hr`;
  }
  const qty = b.quantity ?? (vpu > 0 ? Math.round(b.impactValue / vpu) : 0);
  const unitLabel = b.unitLabel ?? b.unit;
  let sing = unitLabel;
  if (unitLabel === "hours") sing = "hr";
  else if (unitLabel === "miles") sing = "mile";
  else if (unitLabel === "weeks per year") sing = "week";
  else if (unitLabel === "people helped" || unitLabel === "people") sing = "person";
  else if (unitLabel === "young people") sing = "young person";
  else if (unitLabel === "children") sing = "child";
  else if (unitLabel.endsWith("s") && unitLabel.length > 2) sing = unitLabel.slice(0, -1);
  return `${qty.toLocaleString("en-GB")} ${unitLabel} × ${rate}/${sing}`;
}

// ---------------------------------------------------------------------------
// Historic donation-inflation detection & repair (client mirror of the
// server's lib/donationRepair.ts — keep the regexes and rates in sync).
//
// Records saved before the donation fix could have a custom activity like
// "donate £72 a year" matched to a weekly proxy and valued at £3,456 instead
// of £72. The server exposes POST /api/impact/:id/fix-donations for saved
// records; local (signed-out) records are repaired in the browser with
// repairLocalInflatedDonations below.
// ---------------------------------------------------------------------------

const FUNDRAISING_RE = /fund[\s-]?rais/i;
const MONEY_RE = /£\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:pounds?|quid|gbp)\b/i;
const DONATION_CUE_RE = /\bdonat\w*|\bgiv(?:e|es|ing)\b|\bgave\b|\bsponsor\w*|\btithe\w*|\bto\s+(?:\w+\s+){0,3}?(?:charit\w*|church|mosque|temple|good\s+cause|cause\b)/i;

function parseDonationAmount(name: string): number | null {
  if (FUNDRAISING_RE.test(name)) return null;
  if (!DONATION_CUE_RE.test(name)) return null;
  const money = name.match(MONEY_RE);
  if (!money) return null;
  const amount = parseFloat((money[1] ?? money[2] ?? "").replace(/,/g, ""));
  if (!isFinite(amount) || amount <= 0) return null;

  let multiplier = 1;
  if (/\b(?:per|a|each|every)\s+week\b|\bweekly\b/i.test(name)) multiplier = 52;
  else if (/\bfortnight\w*\b/i.test(name)) multiplier = 26;
  else if (/\b(?:per|a|each|every)\s+month\b|\bmonthly\b/i.test(name)) multiplier = 12;
  else if (/\b(?:per|a|each|every)\s+(?:year|annum)\b|\bannually\b|\byearly\b|\bp\.?a\.?\b/i.test(name)) multiplier = 1;
  else if (/\b(?:per|a|each|every)\s+day\b|\bdaily\b/i.test(name)) multiplier = 365;

  return Math.round(amount * multiplier * 100) / 100;
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

interface ResultLike {
  activityBreakdowns?: BreakdownLike[];
  totalHours?: number;
  impactValue?: number;
  contributionValue?: number;
  donationsValue?: number;
  personalDevelopmentValue?: number;
  totalValue?: number;
  sdgBreakdowns?: Array<{ sdg: string; sdgColor: string; value: number }>;
}

function inflatedAnnualAmount(b: BreakdownLike): number | null {
  const name = typeof b.activityName === "string" ? b.activityName : "";
  if (!name) return null;
  const isCustom = b.category === "Custom" || String(b.activityId ?? "").startsWith("custom");
  if (!isCustom) return null;
  if (b.unit === "pound" && (b.valuePerUnit == null || b.valuePerUnit === 1)) return null;
  const annual = parseDonationAmount(name);
  if (annual == null) return null;
  const stored = typeof b.impactValue === "number" ? b.impactValue : 0;
  if (stored <= annual + 0.01) return null;
  return annual;
}

// Total overstatement (in £) across all inflated donation breakdowns in a
// saved result — 0 when the record needs no fixing.
export function detectInflatedDonations(result: unknown): number {
  const r = result as ResultLike | null;
  if (!r || !Array.isArray(r.activityBreakdowns)) return 0;
  return r.activityBreakdowns.reduce((sum, b) => {
    const annual = inflatedAnnualAmount(b);
    if (annual == null) return sum;
    return sum + ((b.impactValue ?? 0) - annual);
  }, 0);
}

const VOLUNTEER_RATE = 12.21;          // keep in sync with server calculateImpact
const PERSONAL_DEV_RATE_PER_HOUR = 15; // keep in sync with server calculateImpact
const round2 = (n: number) => Math.round(n * 100) / 100;

// Repairs a locally-stored (signed-out) impact result in place-style: returns
// a new result object with the inflated donation breakdowns re-valued
// pound-for-pound and all derived totals recomputed, or null when there is
// nothing to fix.
export function repairLocalInflatedDonations<T extends ResultLike>(result: T): T | null {
  if (!result || !Array.isArray(result.activityBreakdowns)) return null;
  let removedHours = 0;
  let changed = false;

  const fixed = result.activityBreakdowns.map((b) => {
    const annual = inflatedAnnualAmount(b);
    if (annual == null) return b;
    changed = true;
    removedHours += typeof b.hours === "number" ? b.hours : 0;
    return {
      ...b,
      impactValue: annual,
      quantity: annual,
      valuePerUnit: 1,
      unit: "pound",
      unitLabel: "pounds donated per year",
      hours: 0,
      proxy: "Money donated to charity — counted pound for pound",
      proxyYear: "",
    };
  });

  if (!changed) return null;

  const totalHours = Math.max(0, (result.totalHours ?? 0) - removedHours);
  const impactValue = fixed.reduce((sum, b) => sum + (b.impactValue ?? 0), 0);
  const donationsValue = result.donationsValue ?? 0;
  const contributionValue = totalHours * VOLUNTEER_RATE;
  const personalDevelopmentValue = totalHours * PERSONAL_DEV_RATE_PER_HOUR;
  const totalValue = impactValue + contributionValue + donationsValue + personalDevelopmentValue;

  const sdgMap = new Map<string, { sdg: string; sdgColor: string; value: number }>();
  for (const b of fixed) {
    const sdg = b.sdg ?? "Good Health and Well-Being";
    if (!sdgMap.has(sdg)) sdgMap.set(sdg, { sdg, sdgColor: b.sdgColor ?? "#4C9F38", value: 0 });
    sdgMap.get(sdg)!.value += b.impactValue ?? 0;
  }

  return {
    ...result,
    activityBreakdowns: fixed,
    totalHours,
    impactValue: round2(impactValue),
    contributionValue: round2(contributionValue),
    donationsValue: round2(donationsValue),
    personalDevelopmentValue: round2(personalDevelopmentValue),
    totalValue: round2(totalValue),
    sdgBreakdowns: Array.from(sdgMap.values()).map((s) => ({ ...s, value: round2(s.value) })),
  };
}
