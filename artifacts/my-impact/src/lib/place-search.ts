/**
 * Town and postcode lookups via postcodes.io, shared by the home location
 * field and the activity location picker.
 *
 * A picked town is matched to its nearest live postcode. That gives it the same
 * local authority and region a typed postcode would report, and a postcode that
 * GoVo can search on (GoVo ignores town names and outward codes).
 */

const POSTCODES_BASE = "https://api.postcodes.io";
const LOOKUP_TIMEOUT_MS = 5000;
const SEARCH_LIMIT = 100;
const MAX_SUGGESTIONS = 10;
const NEAREST_RADIUS_METRES = 2000;

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?[0-9][A-Z]{2}$/;
const UK_OUTWARD_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?$/;

function compact(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function isFullPostcode(raw: string): boolean {
  return UK_POSTCODE_RE.test(compact(raw));
}

export function isOutwardCode(raw: string): boolean {
  return UK_OUTWARD_RE.test(compact(raw));
}

export function isPostcodeLike(raw: string): boolean {
  return isFullPostcode(raw) || isOutwardCode(raw);
}

/** "ng15fs" → "NG1 5FS"; outward codes come back uppercased. */
export function formatPostcode(raw: string): string {
  const code = compact(raw);
  return isFullPostcode(code) ? `${code.slice(0, -3)} ${code.slice(-3)}` : code;
}

/** Everything a full postcode tells us about an area. */
export interface PostcodeArea {
  postcode: string;
  outwardCode: string;
  lat: number;
  lng: number;
  adminDistrict: string;
  region: string;
  country: string;
}

/** Where someone says they are. `locationName` is null for a typed postcode. */
export interface HomeLocation extends PostcodeArea {
  locationName: string | null;
}

export type PostcodeLookup =
  | { status: "found"; area: PostcodeArea }
  | { status: "not_found" }
  | { status: "unavailable" };

/** A single town/area suggestion from the postcodes.io /places search. */
export interface PlaceSuggestion {
  id: string;
  name: string;
  /** The place's other language name, when it has one (Newport / Casnewydd). */
  altName: string | null;
  /** e.g. "City", "Village", "Suburban Area" */
  localType: string;
  localAuthority: string;
  region: string;
  country: string;
  outwardCode: string;
  lat: number;
  lng: number;
}

/** Throws when postcodes.io can't be reached; null means it has no answer. */
async function getResult(path: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort);
  try {
    const res = await fetch(`${POSTCODES_BASE}${path}`, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`postcodes.io responded ${res.status}`);
    const json = (await res.json()) as { result?: unknown };
    return json.result ?? null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function toPostcodeArea(result: unknown): PostcodeArea | null {
  const r = (result ?? {}) as Record<string, unknown>;
  if (typeof r.latitude !== "number" || typeof r.longitude !== "number") return null;
  if (typeof r.postcode !== "string") return null;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    postcode: r.postcode,
    outwardCode: text(r.outcode) || compact(r.postcode).slice(0, -3),
    lat: r.latitude,
    lng: r.longitude,
    adminDistrict: text(r.admin_district) || text(r.admin_county) || text(r.region),
    // postcodes.io only sets region for England.
    region: text(r.region) || text(r.country),
    country: text(r.country),
  };
}

async function nearestPostcode(lat: number, lng: number): Promise<PostcodeArea | null> {
  const coords = `lon=${lng}&lat=${lat}&limit=1`;
  const first = (result: unknown) => toPostcodeArea(Array.isArray(result) ? result[0] : null);
  const near = first(await getResult(`/postcodes?${coords}&radius=${NEAREST_RADIUS_METRES}`));
  return near ?? first(await getResult(`/postcodes?${coords}&widesearch=true`));
}

/** The nearest postcode to a picked place, or null if none could be found. */
export async function resolvePlace(place: PlaceSuggestion): Promise<PostcodeArea | null> {
  try {
    return await nearestPostcode(place.lat, place.lng);
  } catch {
    return null;
  }
}

/** Look up a full postcode, or an outward code by its nearest full postcode. */
export async function lookupPostcode(raw: string): Promise<PostcodeLookup> {
  const code = compact(raw);
  try {
    if (isFullPostcode(code)) {
      const area = toPostcodeArea(await getResult(`/postcodes/${code}`));
      return area ? { status: "found", area } : { status: "not_found" };
    }
    if (isOutwardCode(code)) {
      const result = (await getResult(`/outcodes/${code}`)) as Record<string, unknown> | null;
      if (!result) return { status: "not_found" };
      if (typeof result.latitude !== "number" || typeof result.longitude !== "number") {
        return { status: "unavailable" };
      }
      const area = await nearestPostcode(result.latitude, result.longitude);
      return area
        ? { status: "found", area: { ...area, outwardCode: code } }
        : { status: "unavailable" };
    }
    return { status: "not_found" };
  } catch {
    return { status: "unavailable" };
  }
}

/** Matching ignores case, apostrophes and hyphens: "kings lynn", "stoke on trent". */
function normaliseName(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/[-\s]+/g, " ").trim();
}

function namesOf(place: PlaceSuggestion): string[] {
  return [place.name, ...(place.altName ? [place.altName] : [])].map(normaliseName);
}

const LOCAL_TYPE_ORDER = ["City", "Town", "Suburban Area", "Other Settlement", "Village", "Hamlet"];

function matchTier(place: PlaceSuggestion, query: string): number {
  const major = place.localType === "City" || place.localType === "Town";
  const names = namesOf(place);
  if (major && names.includes(query)) return 0;
  if (major && names.some((n) => n.startsWith(query))) return 1;
  if (names.includes(query)) return 2;
  return major ? 3 : 4;
}

function typeOrder(place: PlaceSuggestion): number {
  const index = LOCAL_TYPE_ORDER.indexOf(place.localType);
  return index === -1 ? LOCAL_TYPE_ORDER.length : index;
}

/**
 * postcodes.io returns matches in no useful order: Stoke-on-Trent comes 97th
 * for "Stoke". Put cities and towns called what was typed first.
 */
export function rankPlaces(places: PlaceSuggestion[], rawQuery: string): PlaceSuggestion[] {
  const query = normaliseName(rawQuery);
  return [...places].sort(
    (a, b) => matchTier(a, query) - matchTier(b, query) || typeOrder(a) - typeOrder(b),
  );
}

/** Welsh places can list either language first; always show the English name. */
function toPlaceSuggestion(r: Record<string, unknown>): PlaceSuggestion | null {
  if (typeof r.latitude !== "number" || typeof r.longitude !== "number" || !r.name_1) return null;
  const first = String(r.name_1);
  const second = typeof r.name_2 === "string" && r.name_2 ? r.name_2 : null;
  const useSecond = !!second && r.name_2_lang === "eng";
  // Welsh county names arrive as "Sir Benfro - Pembrokeshire".
  const county = String(r.county_unitary ?? r.district_borough ?? "").split(" - ").pop() ?? "";
  return {
    id: String(r.code ?? `${first}-${r.latitude}`),
    name: useSecond ? (second as string) : first,
    altName: useSecond ? first : second,
    localType: typeof r.local_type === "string" ? r.local_type : "",
    localAuthority: county,
    region: String(r.region ?? r.country ?? ""),
    country: String(r.country ?? ""),
    outwardCode: typeof r.outcode === "string" ? r.outcode : "",
    lat: r.latitude,
    lng: r.longitude,
  };
}

/**
 * Search town/area-level places. Returns [] on any failure, so a search that
 * can't run looks the same as one that found nothing.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  try {
    const result = await getResult(
      `/places?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`,
      signal,
    );
    if (!Array.isArray(result)) return [];
    const places = (result as Array<Record<string, unknown>>)
      .map(toPlaceSuggestion)
      .filter((p): p is PlaceSuggestion => p !== null);
    return rankPlaces(places, query).slice(0, MAX_SUGGESTIONS);
  } catch {
    return [];
  }
}

/** Places named exactly what was typed. */
export function exactMatches(query: string, places: PlaceSuggestion[]): PlaceSuggestion[] {
  const wanted = normaliseName(query);
  return places.filter((p) => namesOf(p).includes(wanted));
}

/** The one place the text can only mean, or null if it needs a choice. */
export function soleMatch(query: string, places: PlaceSuggestion[]): PlaceSuggestion | null {
  const exact = exactMatches(query, places);
  if (exact.length === 1) return exact[0];
  return exact.length === 0 && places.length === 1 ? places[0] : null;
}
