/**
 * Postcode geocoding helper.
 *
 * Wraps postcodes.io (free, no API key) with a small in-memory cache so the
 * same postcode is not re-fetched within a 24-hour window. Provides single
 * lookup and bulk lookup, plus a haversine helper for computing distance
 * between two lat/lng points in miles.
 */

const POSTCODES_BASE = "https://api.postcodes.io";
const TTL_MS = 24 * 60 * 60 * 1000;
const BULK_CHUNK = 100;

export interface PostcodeLookup {
  lat: number;
  lng: number;
  adminDistrict: string;
  region: string;
  country: string;
}

interface CacheEntry extends PostcodeLookup {
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const negativeCache = new Map<string, number>();

function normalize(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function fromResult(r: Record<string, unknown>): PostcodeLookup | null {
  const lat = typeof r.latitude === "number" ? r.latitude : null;
  const lng = typeof r.longitude === "number" ? r.longitude : null;
  if (lat === null || lng === null) return null;
  // /postcodes returns scalar strings; /outcodes returns string[] for the same fields.
  const firstStr = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
      const s = v.find((x) => typeof x === "string" && x.length > 0);
      return typeof s === "string" ? s : "";
    }
    return "";
  };
  return {
    lat,
    lng,
    adminDistrict: firstStr(r.admin_district) || firstStr(r.admin_county) || firstStr(r.region),
    region: firstStr(r.region) || firstStr(r.country),
    country: firstStr(r.country),
  };
}

// Outward-code-only postcodes (e.g. "M1", "EH1", "SW1A") are common when users
// give just the area for privacy. postcodes.io exposes them via /outcodes.
const OUTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/;
function isOutcodeOnly(key: string): boolean {
  return OUTCODE_RE.test(key);
}

function readCache(key: string): PostcodeLookup | null {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return { lat: hit.lat, lng: hit.lng, adminDistrict: hit.adminDistrict, region: hit.region, country: hit.country };
  }
  if (hit) cache.delete(key);
  return null;
}

function writeCache(key: string, lookup: PostcodeLookup) {
  cache.set(key, { ...lookup, expiresAt: Date.now() + TTL_MS });
}

function readNegative(key: string): boolean {
  const hit = negativeCache.get(key);
  if (hit && hit > Date.now()) return true;
  if (hit) negativeCache.delete(key);
  return false;
}

function writeNegative(key: string) {
  negativeCache.set(key, Date.now() + TTL_MS);
}

/**
 * Deterministic geocode stubs for e2e tests. The ZZ postcode area is
 * reserved (never allocated by Royal Mail), so these keys can never
 * collide with a real lookup. Only active when E2E_TEST_MODE=1.
 */
const E2E_STUB_LOOKUPS: Record<string, PostcodeLookup> = {
  ZZ11ZZ: { lat: 53.48, lng: -2.24, adminDistrict: "Testford", region: "Test Region", country: "England" },
  ZZ22ZZ: { lat: 53.5, lng: -2.3, adminDistrict: "Pendington", region: "Test Region", country: "England" },
};

export async function geocodePostcode(raw: string): Promise<PostcodeLookup | null> {
  const key = normalize(raw);
  if (!key) return null;
  if (process.env.E2E_TEST_MODE === "1" && E2E_STUB_LOOKUPS[key]) {
    return E2E_STUB_LOOKUPS[key];
  }
  const cached = readCache(key);
  if (cached) return cached;
  if (readNegative(key)) return null;

  try {
    // Outward-code-only inputs (e.g. "M1", "EH1") must use /outcodes; the
    // /postcodes endpoint requires a full postcode and 404s for outcodes.
    if (isOutcodeOnly(key)) {
      const lookup = await fetchOutcode(key);
      if (lookup) {
        writeCache(key, lookup);
        return lookup;
      }
      writeNegative(key);
      return null;
    }

    const resp = await fetch(`${POSTCODES_BASE}/postcodes/${encodeURIComponent(key)}`);
    if (resp.ok) {
      const json = (await resp.json()) as { status?: number; result?: Record<string, unknown> };
      if (json.status === 200 && json.result) {
        const lookup = fromResult(json.result);
        if (lookup) {
          writeCache(key, lookup);
          return lookup;
        }
      }
    }
    writeNegative(key);
    return null;
  } catch {
    return null;
  }
}

async function fetchOutcode(outcode: string): Promise<PostcodeLookup | null> {
  try {
    const resp = await fetch(`${POSTCODES_BASE}/outcodes/${encodeURIComponent(outcode)}`);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { status?: number; result?: Record<string, unknown> };
    if (json.status !== 200 || !json.result) return null;
    return fromResult(json.result);
  } catch {
    return null;
  }
}

/**
 * Bulk-geocode up to a few hundred postcodes via the /postcodes endpoint.
 * Returns a map keyed by the normalised postcode. Unknown / invalid postcodes
 * are simply omitted from the map.
 */
export async function geocodePostcodes(rawList: string[]): Promise<Map<string, PostcodeLookup>> {
  const results = new Map<string, PostcodeLookup>();
  const toFetch: string[] = [];

  for (const raw of rawList) {
    const key = normalize(raw);
    if (!key) continue;
    const cached = readCache(key);
    if (cached) {
      results.set(key, cached);
      continue;
    }
    if (readNegative(key)) continue;
    toFetch.push(key);
  }

  for (let i = 0; i < toFetch.length; i += BULK_CHUNK) {
    const chunk = toFetch.slice(i, i + BULK_CHUNK);
    try {
      const resp = await fetch(`${POSTCODES_BASE}/postcodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: chunk }),
      });
      if (!resp.ok) continue;
      const json = (await resp.json()) as {
        status?: number;
        result?: Array<{ query?: string; result?: Record<string, unknown> | null }>;
      };
      if (!Array.isArray(json.result)) continue;
      for (const row of json.result) {
        const queryKey = normalize(row.query ?? "");
        if (!queryKey) continue;
        if (!row.result) {
          writeNegative(queryKey);
          continue;
        }
        const lookup = fromResult(row.result);
        if (!lookup) {
          writeNegative(queryKey);
          continue;
        }
        writeCache(queryKey, lookup);
        results.set(queryKey, lookup);
      }
    } catch {
      // Swallow and continue with whatever we have.
    }
  }

  return results;
}

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function normalizePostcodeKey(raw: string): string {
  return normalize(raw);
}
