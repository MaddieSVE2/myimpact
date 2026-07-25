/**
 * Community corrections layer for pre-mapped local charity suggestions.
 *
 * Verified user submissions are stored as override rows (patch / remove /
 * add) per local authority. Overrides are merged over the stored suggestion
 * lists at read time, so fixes are live for everyone immediately and are
 * automatically re-applied whenever an area's suggestions are regenerated.
 */

import {
  db,
  localCharityOverridesTable,
  type LocalCharityOverride,
  type StoredCharityPlace,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { normalizeCharityName, isConfidentNameMatch } from "./charity-name.js";

export type CategoryPlaces = { category: string; places: StoredCharityPlace[] };

/**
 * Match an override to a stored place by name. Uses the conservative
 * confident-match helper so minor naming variants still match (e.g.
 * "Fife Voluntary Action" vs "Fife Voluntary Action (FVA)").
 */
function nameMatches(override: LocalCharityOverride, placeName: string): boolean {
  if (!override.targetName) return false;
  return (
    normalizeCharityName(override.targetName) === normalizeCharityName(placeName) ||
    isConfidentNameMatch(override.targetName, placeName)
  );
}

/**
 * Merge an authority's overrides into its stored suggestion lists.
 * Order: patches, then removals, then additions. An override with a null
 * category applies to every category (matched by charity name).
 */
export function mergeOverrides(
  categories: CategoryPlaces[],
  overrides: LocalCharityOverride[],
): CategoryPlaces[] {
  if (overrides.length === 0) return categories;

  const patches = overrides.filter((o) => o.kind === "patch" && o.patch);
  const removals = overrides.filter((o) => o.kind === "remove");
  const additions = overrides.filter((o) => o.kind === "add" && o.place);

  const result: CategoryPlaces[] = categories.map((entry) => {
    let places = entry.places.map((p) => {
      let patched = p;
      for (const o of patches) {
        if ((o.category == null || o.category === entry.category) && nameMatches(o, p.name)) {
          patched = { ...patched, ...o.patch };
        }
      }
      return patched;
    });

    places = places.filter(
      (p) =>
        !removals.some(
          (o) => (o.category == null || o.category === entry.category) && nameMatches(o, p.name),
        ),
    );

    return { category: entry.category, places };
  });

  for (const o of additions) {
    const category = o.category ?? "Community";
    const place = o.place as StoredCharityPlace;
    const existing = result.find((e) => e.category === category);
    if (existing) {
      const already = existing.places.some(
        (p) => normalizeCharityName(p.name) === normalizeCharityName(place.name),
      );
      if (!already) existing.places.push(place);
    } else {
      result.push({ category, places: [place] });
    }
  }

  return result.filter((e) => e.places.length > 0);
}

export async function getOverridesForAuthority(
  localAuthority: string,
): Promise<LocalCharityOverride[]> {
  return db
    .select()
    .from(localCharityOverridesTable)
    .where(eq(localCharityOverridesTable.localAuthority, localAuthority));
}

export async function addOverride(values: {
  localAuthority: string;
  category?: string | null;
  targetName?: string | null;
  kind: "patch" | "remove" | "add";
  patch?: Partial<StoredCharityPlace> | null;
  place?: StoredCharityPlace | null;
}): Promise<void> {
  await db.insert(localCharityOverridesTable).values({
    localAuthority: values.localAuthority,
    category: values.category ?? null,
    targetName: values.targetName ?? null,
    kind: values.kind,
    patch: values.patch ?? null,
    place: values.place ?? null,
  });
}
