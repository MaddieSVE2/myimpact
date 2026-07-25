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
  source: "ai";
  verified: boolean;
  registrationNumber?: string;
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

export type LocalCharityArea = typeof localCharityAreasTable.$inferSelect;
export type LocalCharitySuggestion = typeof localCharitySuggestionsTable.$inferSelect;
