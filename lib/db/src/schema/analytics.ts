import { pgTable, text, timestamp, serial, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Internal, privacy-first analytics event log. No PII is stored beyond an
 * optional foreign key to the existing `users` table; all other event
 * properties live in `props` and are explicitly chosen at the call site.
 *
 * `surface` separates member-side events ("member") from organisation-side
 * events ("org") so funnels can be reported separately.
 */
export const analyticsEventsTable = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    eventName: text("event_name").notNull(),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    surface: text("surface").notNull().default("member"),
    props: jsonb("props"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    eventNameIdx: index("analytics_events_event_name_idx").on(t.eventName),
    userIdIdx: index("analytics_events_user_id_idx").on(t.userId),
    createdAtIdx: index("analytics_events_created_at_idx").on(t.createdAt),
  }),
);

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
