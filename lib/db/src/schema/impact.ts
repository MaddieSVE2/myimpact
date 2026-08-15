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
  // Per-occurrence defaults for the reminder prompt: what ONE occurrence
  // normally looks like (SelectedActivity[] with per-occurrence quantities
  // and hours, NOT annualised). NULL for legacy templates — the server then
  // derives defaults from defaultActivities divided by occurrences per year.
  occurrenceActivities: jsonb("occurrence_activities"),
  occurrenceDonationsGBP: numeric("occurrence_donations_gbp", { precision: 12, scale: 2 }),
  // Usual activity location, same shape as impact_records.location_json.
  usualLocationJson: jsonb("usual_location_json"),
  // Prior org-sharing preference: id of the org the user last chose to share
  // occurrences from this template with. NULL = no stored preference.
  sharingOrgId: text("sharing_org_id"),
  // Set when the user skips the current scheduled occurrence — silences the
  // due prompt until the next occurrence without creating any records.
  lastSkippedAt: timestamp("last_skipped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("recurring_templates_user_idx").on(t.userId),
}));

export const insertRecurringTemplateSchema = createInsertSchema(recurringTemplatesTable).omit({
  id: true,
  createdAt: true,
  anchorDate: true,
  lastConfirmedAt: true,
  lastSkippedAt: true,
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
  tags: text("tags").array().notNull().$default(() => []),
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
  // First-class contribution kind — distinguishes annualised estimates from
  // actual, per-occurrence contributions so yearly aggregation can reconcile
  // the two instead of double-counting. Values:
  //   'legacy'                — rows created before the kind column existed,
  //                             plus saves from clients that don't send a kind.
  //                             Always summed as-is (historical totals unchanged).
  //   'annual_estimate'       — Full Impact Report wizard annualised estimate.
  //   'quick_log'             — Quick Log actual (per-occurrence quantities,
  //                             stored as-is, no annualisation).
  //   'recurring_confirmation'— entry spawned by confirming a recurring template.
  //   'bulk_retrospective'    — bulk backfill for a past year (habit backfill /
  //                             year-rollover bulk create).
  //   'org_api'               — pushed via the org REST API (attested).
  kind: text("kind").notNull().default("legacy"),
  // Structured activity location (where the activity happened). Shape:
  // { label, postcode, townCity, lat, lng, localAuthority, region, country,
  //   mode: 'in_person' | 'online' | 'multiple' }. All fields optional except
  // mode. NULL = no structured location captured (legacy rows keep using the
  // flat region/outwardCode/lat/lng columns for display). A future
  // beneficiary-location field will be a sibling jsonb column.
  locationJson: jsonb("location_json"),
  // Reporting period the contribution counts toward, derived from entryDate
  // at save time (calendar year today). Nullable so a record whose date fits
  // no period — or several — still saves and can be associated later.
  reportingYear: integer("reporting_year"),
  // Authoritative Full Impact Report period (annual_estimate rows saved by
  // the wizard from Aug 2026 on). Chosen ONCE at the start of the report
  // journey — calendar year, academic year, or a supported custom range —
  // and carried through save and display. Both dates are inclusive, stored
  // at midnight UTC. NULL on legacy rows and non-report kinds; aggregation
  // falls back to entryDate/reportingYear exactly as before.
  reportStartDate: timestamp("report_start_date"),
  reportEndDate: timestamp("report_end_date"),
  // 'calendar' | 'academic' | 'financial' | 'custom' — display-only hint for
  // how the period was chosen. Never used in calculations.
  reportPeriodType: text("report_period_type"),
  // Set on org submissions created by sharing a saved Full Impact Report
  // (the "Review & share" flow). Points at the member's source report record
  // so (a) org-facing views can exclude the personal report as a twin and
  // (b) personal aggregations can drop the org copy as a duplicate. NULL for
  // ad-hoc submissions and all non-submission rows.
  sourceReportId: integer("source_report_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userEntryDateIdx: index("impact_records_user_entry_date_idx").on(t.userId, t.entryDate),
}));

export const insertImpactRecordSchema = createInsertSchema(impactRecordsTable).omit({ id: true, createdAt: true });
export type InsertImpactRecord = z.infer<typeof insertImpactRecordSchema>;
export type ImpactRecord = typeof impactRecordsTable.$inferSelect;
