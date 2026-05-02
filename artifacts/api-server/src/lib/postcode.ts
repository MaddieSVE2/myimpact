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
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    lat,
    lng,
    adminDistrict: str(r.admin_district) || str(r.admin_county) || str(r.region),
    region: str(r.region) || str(r.country),
    country: str(r.country),
  };
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

export async function geocodePostcode(raw: string): Promise<PostcodeLookup | null> {
  const key = normalize(raw);
  if (!key) return null;
  const cached = readCache(key);
  if (cached) return cached;
  if (readNegative(key)) return null;

  try {
    const resp = await fetch(`${POSTCODES_BASE}/postcodes/${encodeURIComponent(key)}`);
    if (!resp.ok) {
      writeNegative(key);
      return null;
    }
    const json = (await resp.json()) as { status?: number; result?: Record<string, unknown> };
    if (json.status !== 200 || !json.result) {
      writeNegative(key);
      return null;
    }
    const lookup = fromResult(json.result);
    if (!lookup) {
      writeNegative(key);
      return null;
    }
    writeCache(key, lookup);
    return lookup;
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
