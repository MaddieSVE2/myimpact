import { pgTable, text, timestamp, boolean, serial } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const magicTokensTable = pgTable("magic_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  confirmed: boolean("confirmed").default(false).notNull(),
});

export const userProfilesTable = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => usersTable.id),
  situation: text("situation").array(),
  interests: text("interests").array(),
  postcode: text("postcode"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pageViewsTable = pgTable("page_views", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  page: text("page").notNull(),
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
export type MagicToken = typeof magicTokensTable.$inferSelect;
export type UserProfile = typeof userProfilesTable.$inferSelect;
export type PageView = typeof pageViewsTable.$inferSelect;
