import { pgTable, text, serial, numeric, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const impactRecordsTable = pgTable("impact_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  totalValue: numeric("total_value", { precision: 12, scale: 2 }).notNull(),
  impactValue: numeric("impact_value", { precision: 12, scale: 2 }).notNull(),
  contributionValue: numeric("contribution_value", { precision: 12, scale: 2 }).notNull(),
  donationsValue: numeric("donations_value", { precision: 12, scale: 2 }).notNull(),
  personalDevelopmentValue: numeric("personal_development_value", { precision: 12, scale: 2 }).notNull(),
  totalHours: integer("total_hours").notNull(),
  activitiesJson: jsonb("activities_json").notNull(),
  resultJson: jsonb("result_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertImpactRecordSchema = createInsertSchema(impactRecordsTable).omit({ id: true, createdAt: true });
export type InsertImpactRecord = z.infer<typeof insertImpactRecordSchema>;
export type ImpactRecord = typeof impactRecordsTable.$inferSelect;
