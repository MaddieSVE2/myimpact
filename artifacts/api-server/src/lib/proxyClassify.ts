// Heuristic classification of financial proxies by outcome horizon.
//
// Some proxies represent long-horizon outcomes (e.g. "Lifetime productivity
// gains from achieving 5-7 good GCSEs — £79,008") but the app applies proxy
// values per contribution (per session, hour, person helped this year).
// Applying a lifetime value at full strength to one tutoring session wildly
// overstates the impact, so long-horizon proxies get a default deflation
// factor that scales them down to a defensible per-contribution share.
//
// These defaults seed the `proxies` table on first startup; super admins can
// refine them afterwards in the admin panel without code changes.

export type ProxyHorizon = "per_instance" | "annual" | "multi_year" | "lifetime";

// Default deflation factors per horizon. Rationale:
// - lifetime: a whole-life outcome (often £50k+) is the product of many years
//   of input from many contributors. 0.001 attributes ~0.1% of the outcome to
//   a single logged contribution — e.g. £79,008 lifetime GCSE productivity
//   gain becomes ~£79 per tutoring engagement, a defensible session-scale
//   number.
// - multi_year: cumulative multi-year benefits get 2% per contribution.
// - annual and per_instance values are already contribution-scale: no
//   deflation by default (guardrails in the matcher still apply).
export const DEFAULT_DEFLATION: Record<ProxyHorizon, number> = {
  per_instance: 1,
  annual: 1,
  multi_year: 0.02,
  lifetime: 0.001,
};

const LIFETIME_RE = /\blife[\s-]?time\b|\bover (?:a|their|the) (?:working )?life\b|\bworking life\b|\blifelong\b|\blater in life\b/i;
const MULTI_YEAR_RE = /\bover \d+\s*years?\b|\bcumulative\b|\b\d+[\s-]year (?:period|benefit|horizon)\b/i;
const ANNUAL_RE = /\bper (?:person|people|household|employee|pupil|child|family|organisation|business|volunteer|user|member|adult|young person|participant|carer|patient|resident|individual)[^,]{0,40}\bper (?:year|annum)\b|\bper year\b|\bper annum\b|\bannual(?:ly)?\b|\byearly\b/i;

export function classifyHorizon(title: string, unit: string): ProxyHorizon {
  const text = `${title} ${unit}`;
  if (LIFETIME_RE.test(text)) return "lifetime";
  if (MULTI_YEAR_RE.test(text)) return "multi_year";
  if (ANNUAL_RE.test(text)) return "annual";
  return "per_instance";
}

// Extract a 4-digit source year from the proxy title, e.g. "(2020)".
export function extractSourceYear(title: string): string {
  const m = title.match(/\((\d{4})(?:[/–-]\d{2,4})?\)/);
  return m ? m[1] : "";
}

// Derive which logging units the matcher may pair with this proxy, from the
// unit text SVE publishes. Empty array = any unit is acceptable.
export function deriveAllowedUnits(unit: string): string[] {
  const u = unit.toLowerCase();
  const allowed = new Set<string>();
  if (/\bhour\b/.test(u)) allowed.add("hour");
  if (/\bsession\b|\bvisit\b|\bjourney\b|\bcourse\b|\bevent\b|\bworkshop\b|\bappointment\b|\btrip\b/.test(u)) {
    allowed.add("session");
  }
  if (/\bhousehold/.test(u)) allowed.add("household");
  if (/\bperson\b|\bpeople\b|\bpupil|\bchild|\badult|\bemployee|\bvolunteer|\bparticipant|\bcarer|\bpatient|\bresident|\bindividual|\byoung person|\bmember\b|\buser\b|\bfamil/.test(u)) {
    allowed.add("person");
  }
  if (/\bitem\b|\bunit\b|\btonne\b|\bbin\b|\bbag\b|\btree\b/.test(u)) allowed.add("item");
  return Array.from(allowed);
}

export interface ClassifiedProxy {
  title: string;
  value: number;
  unit: string;
  sourceYear: string;
  horizon: ProxyHorizon;
  deflationFactor: number;
  allowedUnits: string[];
}

// Source JSON contains a few malformed rows (numeric units, test entries) —
// coerce defensively so classification never throws.
export function classifyProxy(p: { title: string; value: number; unit: string | number }): ClassifiedProxy {
  const unit = String(p.unit ?? "");
  const horizon = classifyHorizon(p.title, unit);
  return {
    title: p.title,
    value: p.value,
    unit,
    sourceYear: extractSourceYear(p.title),
    horizon,
    deflationFactor: DEFAULT_DEFLATION[horizon],
    allowedUnits: deriveAllowedUnits(unit),
  };
}
