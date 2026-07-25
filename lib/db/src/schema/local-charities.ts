import { pgTable, text, timestamp, jsonb, primaryKey, index, integer } from "drizzle-orm/pg-core";

/**
 * Pre-mapped local charity suggestions, keyed by local authority.
 *
 * Instead of running a live AI + charity-register lookup every time a user
 * taps a suggestion tile on the Inspire page, results are generated ahead of
 * time per (local authority × main category) and served instantly. The
 * generation pipeline (AI suggestions verified against the Charity Commission
 * or OSCR registers) runs in the background the first time a local authority
 * is seen, and a scheduled job refreshes stale areas monthly.
 */

/** One row per local authority we have seen; tracks generation state. */
export const localCharityAreasTable = pgTable("local_charity_areas", {
  /** Local authority name from postcodes.io admin_district, e.g. "City of Edinburgh". */
  localAuthority: text("local_authority").primaryKey(),
  /** Country from postcodes.io, e.g. "England", "Scotland". Drives register choice. */
  country: text("country").notNull().default(""),
  /** pending → generation queued/in progress; ready → results stored; failed → last attempt errored. */
  status: text("status").notNull().default("pending"),
  lastGeneratedAt: timestamp("last_generated_at"),
  /**
   * Pipeline version the stored results were generated with. Bumped when the
   * generation output changes shape (e.g. v2 added website URLs) so the daily
   * sweep promptly re-generates areas produced by an older pipeline instead
   * of waiting for the monthly window.
   */
  generationVersion: integer("generation_version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export interface StoredCharityPlace {
  name: string;
  description: string;
  howToJoin: string;
  /** Official website URL (https), when the AI is confident about it. */
  website?: string;
  source: "ai" | "community";
  verified: boolean;
  registrationNumber?: string;
  /**
   * True when a lightweight fetch of the charity's website found clear
   * volunteer-recruitment signals; undefined when unknown/undetermined.
   */
  recruitingVolunteers?: boolean;
}

/** One row per (local authority × main activity category) with verified results. */
export const localCharitySuggestionsTable = pgTable(
  "local_charity_suggestions",
  {
    localAuthority: text("local_authority").notNull(),
    category: text("category").notNull(),
    places: jsonb("places").$type<StoredCharityPlace[]>().notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.localAuthority, t.category] }),
    authorityIdx: index("local_charity_suggestions_authority_idx").on(t.localAuthority),
  })
);

/**
 * One community thumbs-up per user per charity within a local authority.
 *
 * charityKey is a stable identifier so votes survive the ~monthly area
 * regeneration: "reg:<registrationNumber>" when the charity is verified,
 * otherwise "name:<normalised name>". When an area's suggestions are
 * re-generated, charities that reappear keep their existing votes because
 * the key matches; votes for charities that vanish simply stop being shown
 * (and re-attach if the charity comes back later).
 */
export const localCharityVotesTable = pgTable(
  "local_charity_votes",
  {
    localAuthority: text("local_authority").notNull(),
    charityKey: text("charity_key").notNull(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /**
     * Last time this vote's charityKey appeared in the area's stored
     * suggestions (touched by the daily refresh sweep). Votes whose charity
     * has been absent for a generous grace period are cleaned up.
     */
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.localAuthority, t.charityKey, t.userId] }),
    authorityIdx: index("local_charity_votes_authority_idx").on(t.localAuthority),
  })
);

/**
 * Community corrections layer. Overrides are merged over the stored
 * suggestions at read time, so verified fixes are live immediately and
 * survive regeneration of an area's suggestion list.
 */
export const localCharityOverridesTable = pgTable(
  "local_charity_overrides",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    localAuthority: text("local_authority").notNull(),
    /** Category the override applies to; null = every category (name-matched). */
    category: text("category"),
    /** Charity name to match (normalised comparison in code). Null for additions. */
    targetName: text("target_name"),
    /** "patch" (merge fields), "remove" (hide entry), or "add" (append place). */
    kind: text("kind").notNull(),
    /** Fields to merge for kind=patch, e.g. { "website": "https://..." }. */
    patch: jsonb("patch").$type<Partial<StoredCharityPlace>>(),
    /** Full place to append for kind=add. */
    place: jsonb("place").$type<StoredCharityPlace>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    authorityIdx: index("local_charity_overrides_authority_idx").on(t.localAuthority),
  })
);

/** Every user submission (correction or suggestion), applied or not. */
export const localCharitySubmissionsTable = pgTable(
  "local_charity_submissions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    /** "correction" or "suggestion". */
    type: text("type").notNull(),
    localAuthority: text("local_authority").notNull(),
    country: text("country").notNull().default(""),
    category: text("category"),
    charityName: text("charity_name").notNull(),
    /** For corrections: wrong_website | wrong_description | closed | other. */
    issueType: text("issue_type"),
    submittedWebsite: text("submitted_website"),
    note: text("note"),
    /** "applied" (auto-verified) or "needs_review" (emailed to admin). */
    status: text("status").notNull(),
    /** Short human explanation of the verification outcome. */
    verificationDetail: text("verification_detail"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("local_charity_submissions_user_idx").on(t.userId),
  })
);

export type LocalCharityArea = typeof localCharityAreasTable.$inferSelect;
export type LocalCharitySuggestion = typeof localCharitySuggestionsTable.$inferSelect;
export type LocalCharityVote = typeof localCharityVotesTable.$inferSelect;
export type LocalCharityOverride = typeof localCharityOverridesTable.$inferSelect;
export type LocalCharitySubmission = typeof localCharitySubmissionsTable.$inferSelect;
