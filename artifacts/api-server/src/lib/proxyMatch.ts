// Matching an activity someone described in their own words to a proxy.
//
// The AI picks from a shortlist built here, and its pick is then checked
// here: a proxy only prices an activity when one of what the person counts
// (a bag, a visit, an hour) is what the proxy is priced per. Without that,
// "reused 75 plastic bags" can be priced at a per-household or per-tonne
// figure for every bag.

import type { StoredProxy } from "./proxyStore.js";

const STOP_WORDS = new Set([
  "a","an","the","and","or","of","in","at","to","for","is","are","by","with",
  "my","i","do","that","this","it","on","from","up","be","as","we","not",
  // Words about how often or how much, and "use", which say nothing about
  // the outcome ("single use" was matching drug-use proxies).
  "use","uses","used","using","per","every","each","year","years","yearly",
  "week","weeks","weekly","month","months","monthly","day","days","daily",
  "time","times","once","twice","about","roughly","around","approximately",
  "some","have","has","had","been","was","were","our","their","them","they",
  "you","your","who","which","when","instead","than","into","out","all","also",
  "can","did","does","done","doing",
]);

const words = (text: string): string[] =>
  text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

/** "bags" -> "bag", "recycling" -> "recycl", "shopping" -> "shop". */
function stem(word: string): string {
  let w = word;
  if (w.length > 6 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  // "shopp" -> "shop", "runn" -> "run"
  if (w.length > 3 && w[w.length - 1] === w[w.length - 2] && !/[aeiou]/.test(w[w.length - 1])) w = w.slice(0, -1);
  return w;
}

export function extractKeywords(name: string): string[] {
  return [...new Set(words(name).filter((w) => w.length > 2 && !STOP_WORDS.has(w)))];
}

/** A keyword matches a whole word of the title, or the start of one. */
function titleHas(titleWords: string[], titleStems: string[], keyword: string): boolean {
  const s = stem(keyword);
  return (
    titleWords.includes(keyword) ||
    titleStems.includes(s) ||
    (s.length >= 4 && titleWords.some((w) => w.startsWith(s)))
  );
}

/**
 * The proxies worth showing the AI for this activity, best first. Words are
 * matched whole (or from their start), never inside another word: "use" is
 * not in "household". Rarer words count for more, so the one plastics proxy
 * outranks the many that mention a common word. Nothing matching means no
 * shortlist: an unrelated proxy is worse than none.
 */
export function candidateProxies(proxies: StoredProxy[], activityName: string, limit = 20): StoredProxy[] {
  const keywords = extractKeywords(activityName);
  if (keywords.length === 0 || proxies.length === 0) return [];

  const titles = proxies.map((p) => {
    const titleWords = words(p.title);
    return { titleWords, titleStems: titleWords.map(stem) };
  });
  const hits = keywords.map((k) => titles.map((t) => titleHas(t.titleWords, t.titleStems, k)));
  const weights = hits.map((h) => {
    const matching = h.filter(Boolean).length;
    return matching === 0 ? 0 : Math.log(1 + proxies.length / matching);
  });

  return proxies
    .map((proxy, i) => ({
      proxy,
      score: hits.reduce((sum, h, k) => sum + (h[i] ? weights[k] : 0), 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.proxy);
}

/**
 * Whether the activity's description and the proxy's title share a word, so
 * the shortlist above could offer the proxy for it at all.
 */
export function proxySharesWord(proxyTitle: string, activityName: string): boolean {
  const titleWords = words(proxyTitle);
  const titleStems = titleWords.map(stem);
  return extractKeywords(activityName).some((k) => titleHas(titleWords, titleStems, k));
}

// Proxies priced per amount of something measured (weight, area, distance,
// energy, money, a length of time) rather than per thing counted.
const MEASURES: RegExp[] = [
  /\btonnes?\b|\btco2e?\b|\bkgs?\b|\bkilograms?\b/,
  /\bhectares?\b|\bacres?\b|m2\b|m²|\bmetre|\bsq\.? ?ft\b|\bsquare\b/,
  /\bmiles?\b|\bkm\b|\bkilometres?\b/,
  /\bkwhs?\b/,
  /£|\bpounds?\b/,
];
// A length of time on its own ("Per week", "Number of years"). "Number of
// people per year" is priced per person.
const TIME_ONLY = /^(?:number of |per )?(year|month|week|day)s?$/;
const YEARLY_SUFFIX = /\s*(?:per|a|each|every)\s+(?:year|annum)\s*$/;

// Words in a proxy's unit that don't say what is counted ("Number of falls
// prevented" counts falls).
const UNIT_FILLER = new Set([
  "number","of","per","the","a","an","and","x","year","years","annum","new","one","way",
  "avoided","prevented","funded","created","awarded","enabled","invested",
]);
// Other names for the units the AI can choose.
const SAME_AS: Record<string, ReadonlySet<string>> = {
  hour: new Set(["hour"]),
  session: new Set([
    "session","visit","appointment","course","attendance","call","contact",
    "assessment","journey","trip","event","workshop",
  ]),
  person: new Set([
    "person","people","student","learner","trainee","client","claimant",
    "apprentice","graduate","child","pupil","volunteer","participant",
    "patient","resident","carer","employee","member","adult","individual",
  ]),
  household: new Set(["household"]),
};

/**
 * Whether the proxy is priced per what the person is counting.
 * - A proxy priced per tonne, hectare, mile, £ or week only fits when the
 *   person is asked for that same measure ("tonnes of food per year").
 * - Otherwise the unit must be one the proxy allows, or the person must be
 *   counting what the proxy's own unit names: "trees planted" fits "Number
 *   of trees", hours fit "Number of hours volunteered" (stored as per
 *   person), and "bags" fit neither "Number of households" nor "Number of
 *   incidents".
 * The unit is never swapped for an allowed one: the question was written
 * for the unit the AI chose, so the number given would answer something else.
 */
export function unitFitsProxy(proxy: Pick<StoredProxy, "unit" | "allowedUnits">, unit: string, unitLabel: string): boolean {
  const proxyUnit = proxy.unit.trim().toLowerCase();
  const label = unitLabel.trim().toLowerCase();

  const measure = MEASURES.find((m) => m.test(proxyUnit));
  if (measure) return measure.test(label);

  const time = proxyUnit.match(TIME_ONLY);
  if (time) return new RegExp(`\\b${time[1]}s?\\b`).test(label.replace(YEARLY_SUFFIX, ""));

  if (proxy.allowedUnits.includes(unit)) return true;

  const counted = words(proxyUnit).filter((w) => !UNIT_FILLER.has(w)).map(stem);
  const labelStems = new Set(words(label).map(stem));
  return counted.some((noun) => labelStems.has(noun) || !!SAME_AS[unit]?.has(noun));
}

/** Old assumption, kept where the AI gives no estimate. */
export const DEFAULT_HOURS_PER_UNIT = 2;
const MAX_HOURS_PER_UNIT = 8;

/**
 * Hours of the person's own time behind one of what they count (one visit,
 * one item). Everyday habits take none: 75 reused bags are not 150 hours of
 * volunteering.
 */
export function safeHoursPerUnit(raw: unknown): number {
  if (typeof raw !== "number" || !isFinite(raw) || raw < 0) return DEFAULT_HOURS_PER_UNIT;
  return Math.round(Math.min(raw, MAX_HOURS_PER_UNIT) * 100) / 100;
}
