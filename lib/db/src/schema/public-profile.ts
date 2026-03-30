import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const publicProfilesTable = pgTable("public_profiles", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  slug: text("slug").unique().notNull(),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  customMessage: text("custom_message"),
  showHours: boolean("show_hours").default(true).notNull(),
  showSroi: boolean("show_sroi").default(true).notNull(),
  showCategories: boolean("show_categories").default(true).notNull(),
  showJournalHighlights: boolean("show_journal_highlights").default(false).notNull(),
  slugCustomised: boolean("slug_customised").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PublicProfile = typeof publicProfilesTable.$inferSelect;
