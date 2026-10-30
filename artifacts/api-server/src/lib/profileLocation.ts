import { postcodeArea } from "./orgBreakdown.js";

/**
 * The location on a user's profile: `postcode` is what lookups run on, and
 * `locationName` is the town or outward code they chose. Someone who picked a
 * town has that town's nearest postcode here, which isn't where they live.
 */
export interface ProfileLocation {
  postcode: string | null;
  locationName: string | null;
}

type StoredLocation = { postcode?: string | null; locationName?: string | null };

const PROFILE_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;
const MAX_LOCATION_NAME_CHARS = 100;

function cleanLocationName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.trim().slice(0, MAX_LOCATION_NAME_CHARS) || null;
}

/**
 * Works out the location to store from a profile update.
 *
 * Leaving `postcode` out keeps what's stored, and so does a value that isn't a
 * postcode: a browser still running the old wizard can send a typed town name,
 * which no lookup understands.
 */
export function resolveProfileLocation(
  body: Record<string, unknown>,
  existing: StoredLocation | null | undefined,
): ProfileLocation {
  const stored: ProfileLocation = {
    postcode: existing?.postcode ?? null,
    locationName: existing?.locationName ?? null,
  };
  if (!Object.prototype.hasOwnProperty.call(body, "postcode")) return stored;

  const raw = typeof body.postcode === "string" ? body.postcode.trim() : "";
  if (!raw) return { postcode: null, locationName: null };
  if (!PROFILE_POSTCODE_RE.test(raw)) return stored;

  const postcode = raw.toUpperCase();
  const locationName = Object.prototype.hasOwnProperty.call(body, "locationName")
    ? cleanLocationName(body.locationName)
    : postcode === stored.postcode ? stored.locationName : null;
  return { postcode, locationName };
}

/** The general area shown to organisation managers: never the full postcode. */
export function memberArea(profile: StoredLocation | null | undefined): string | null {
  return profile?.locationName?.trim() || postcodeArea(profile?.postcode ?? null);
}
