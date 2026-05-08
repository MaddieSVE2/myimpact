import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Short-lived row-per-request reservations used by the Sidekick quota gate
 * to close the parallel-burst race window. Persisting these (rather than
 * holding them in an in-process Map) means a server restart in the middle
 * of a burst no longer wipes every caller's reservations and lets the next
 * batch of requests briefly slip past the daily cap.
 *
 * Each row reserves one "question slot" (and `AI_INFLIGHT_AVG_TOKENS`
 * worth of tokens) for `userKey` until `expiresAt`. Rows are deleted
 * immediately when the response finishes; an interval sweep also deletes
 * any rows whose `expiresAt` has passed (e.g. crashed processes).
 */
export const aiInflightReservationsTable = pgTable(
  "ai_inflight_reservations",
  {
    id: serial("id").primaryKey(),
    userKey: text("user_key").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userKeyExpiresIdx: index("ai_inflight_user_key_expires_idx").on(
      t.userKey,
      t.expiresAt,
    ),
    expiresIdx: index("ai_inflight_expires_at_idx").on(t.expiresAt),
  }),
);

export type AiInflightReservation =
  typeof aiInflightReservationsTable.$inferSelect;
