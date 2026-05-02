import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const calendarSourcesTable = pgTable("calendar_sources", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  calendarId: text("calendar_id"),
  calendarName: text("calendar_name"),
  filterText: text("filter_text"),
  status: text("status").notNull().default("active"),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  tokenExpiresAt: timestamp("token_expires_at"),
  providerAccountEmail: text("provider_account_email"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const calendarEventsTable = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => calendarSourcesTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  location: text("location"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  promptStatus: text("prompt_status").notNull().default("pending"),
  promptShownAt: timestamp("prompt_shown_at"),
  loggedAt: timestamp("logged_at"),
  loggedRecordId: text("logged_record_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});

export type CalendarSource = typeof calendarSourcesTable.$inferSelect;
export type CalendarEvent = typeof calendarEventsTable.$inferSelect;
