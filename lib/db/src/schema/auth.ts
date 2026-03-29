import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

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

export type User = typeof usersTable.$inferSelect;
export type MagicToken = typeof magicTokensTable.$inferSelect;
