import { pgTable, text, serial, numeric, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recurringTemplatesTable = pgTable("recurring_templates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull(),
  // 'weekly' | 'fortnightly' | 'monthly'
  cadence: text("cadence").notNull(),
  // weekly/fortnightly: 0–6 (0 = Sunday). monthly: 1–28.
  dayOfPeriod: integer("day_of_period").notNull(),
  // Anchor date used for fortnightly parity (so we know which weeks fire).
  anchorDate: timestamp("anchor_date").defaultNow().notNull(),
  // Default activities used to pre-fill the wizard. Stored as SelectedActivity[].
  defaultActivities: jsonb("default_activities").notNull(),
  defaultDonationsGBP: numeric("default_donations_gbp", { precision: 12, scale: 2 }).notNull().default("0"),
  // null until the user confirms a scheduled occurrence at least once.
  lastConfirmedAt: timestamp("last_confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("recurring_templates_user_idx").on(t.userId),
}));

export const insertRecurringTemplateSchema = createInsertSchema(recurringTemplatesTable).omit({
  id: true,
  createdAt: true,
  anchorDate: true,
  lastConfirmedAt: true,
});
export type InsertRecurringTemplate = z.infer<typeof insertRecurringTemplateSchema>;
export type RecurringTemplate = typeof recurringTemplatesTable.$inferSelect;

export const impactRecordsTable = pgTable("impact_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  periodLabel: text("period_label"),
  totalValue: numeric("total_value", { precision: 12, scale: 2 }).notNull(),
  impactValue: numeric("impact_value", { precision: 12, scale: 2 }).notNull(),
  contributionValue: numeric("contribution_value", { precision: 12, scale: 2 }).notNull(),
  donationsValue: numeric("donations_value", { precision: 12, scale: 2 }).notNull(),
  personalDevelopmentValue: numeric("personal_development_value", { precision: 12, scale: 2 }).notNull(),
  totalHours: integer("total_hours").notNull(),
  activitiesJson: jsonb("activities_json").notNull(),
  resultJson: jsonb("result_json").notNull(),
  region: text("region"),
  outwardCode: text("outward_code"),
  lat: numeric("lat", { precision: 10, scale: 6 }),
  lng: numeric("lng", { precision: 10, scale: 6 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertImpactRecordSchema = createInsertSchema(impactRecordsTable).omit({ id: true, createdAt: true });
export type InsertImpactRecord = z.infer<typeof insertImpactRecordSchema>;
export type ImpactRecord = typeof impactRecordsTable.$inferSelect;
