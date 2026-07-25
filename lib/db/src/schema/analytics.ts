import {
  pgTable,
  text,
  timestamp,
  serial,
  jsonb,
  index,
  integer,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

/**
 * Durable daily aggregates of activity, written by the retention cleanup
 * job just before raw rows older than the retention window are deleted.
 * One row per (day, event_name, surface). Contains counts only — no user
 * ids, props, or any other per-row detail — so it can be kept forever
 * cheaply and powers long-term trend views (e.g. year-over-year growth).
 *
 * Legacy `page_views` rows (the pre-analytics table) are archived under
 * the event name "page_view_legacy" so they don't double-count the
 * mirrored "page_view" analytics events.
 */
export const analyticsDailySummaryTable = pgTable(
  "analytics_daily_summary",
  {
    id: serial("id").primaryKey(),
    day: date("day").notNull(),
    eventName: text("event_name").notNull(),
    surface: text("surface").notNull().default("member"),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    dayEventSurfaceUq: uniqueIndex("analytics_daily_summary_day_event_surface_uq").on(
      t.day,
      t.eventName,
      t.surface,
    ),
    dayIdx: index("analytics_daily_summary_day_idx").on(t.day),
  }),
);

export type AnalyticsDailySummary = typeof analyticsDailySummaryTable.$inferSelect;
