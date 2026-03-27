import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const organisationsTable = pgTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgMembersTable = pgTable("org_members", {
  orgId: text("org_id").notNull().references(() => organisationsTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type Organisation = typeof organisationsTable.$inferSelect;
export type OrgMember = typeof orgMembersTable.$inferSelect;
