/**
 * How one-off entries (Quick Log, a regular activity's occurrence, an
 * activity emailed in) treat activities whose value is yearly. No imports, so
 * the API's tests can check these lists match the server's
 * (artifacts/api-server/src/lib/impactData.ts).
 */

/**
 * Valued per person (or child) supported over a year: the yearly benefit of
 * ongoing support. Right for yearly estimates, but each one-off entry would
 * count a whole year again, so one-off entries value them as volunteering
 * time (hours) instead.
 */
export const YEARLY_PER_PERSON_ACTIVITY_IDS: ReadonlySet<string> = new Set([
  "befriending",
  "family_caring",
  "helping_neighbours",
  "career_break_school_liaison",
  "coding_education_child",
  "mental_health_support",
  "literacy_support",
  "youth_mentoring",
  "elderly_visiting",
  "digital_coaching",
  "arts_volunteering",
  "tutoring",
  "veterans_breakfast",
  "sports_coaching",
]);

/** Yearly household habits (a year's saving): counted once per calendar year. */
export const YEARLY_HOUSEHOLD_ACTIVITY_IDS: ReadonlySet<string> = new Set(["food_waste", "energy_saving"]);

/** Entry kinds that record a single occasion. */
export const ONE_OFF_KINDS: ReadonlySet<string> = new Set(["quick_log", "recurring_confirmation"]);
