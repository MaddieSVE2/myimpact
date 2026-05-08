import { pgTable, text, serial, numeric, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  // Org-attestation fields. Set when the record was pushed via the org REST
  // API on behalf of a member — these records bypass any verification queue
  // and are flagged in the UI as "attested by <org>".
  attestedByApiKeyId: text("attested_by_api_key_id"),
  attestedAt: timestamp("attested_at"),
  // Member-submitted records: when a logged-in org member submits activities
  // through the dedicated "Submit to organisation" flow, these capture which
  // org received the submission and when. Records also have source='member-submitted'.
  submittedToOrgId: text("submitted_to_org_id"),
  submittedToOrgAt: timestamp("submitted_to_org_at"),
  source: text("source").notNull().default("user"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  // The date this entry counts toward — determines which calendar year and
  // month the entry belongs to on the dashboard. Defaults to the time the
  // record was created but can be backdated by the user when they log a
  // retrospective entry. Existing rows are backfilled from created_at by
  // migration 0025.
  entryDate: timestamp("entry_date").defaultNow().notNull(),
  // Set on entries that were bulk-created when a user ticked an ongoing
  // habit (one entry per remaining month of the calendar year). Lets us
  // trace habit-spawned entries back to their template for overlap warnings
  // and the year-rollover prompt. NULL for one-off / manual entries.
  habitTemplateId: integer("habit_template_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userEntryDateIdx: index("impact_records_user_entry_date_idx").on(t.userId, t.entryDate),
}));

export const insertImpactRecordSchema = createInsertSchema(impactRecordsTable).omit({ id: true, createdAt: true });
export type InsertImpactRecord = z.infer<typeof insertImpactRecordSchema>;
export type ImpactRecord = typeof impactRecordsTable.$inferSelect;
