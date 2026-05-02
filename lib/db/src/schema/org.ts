import { pgTable, text, timestamp, unique, numeric, boolean } from "drizzle-orm/pg-core";
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
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
  userUnique: unique("org_members_user_unique").on(table.userId),
  membershipUnique: unique("org_members_membership_unique").on(table.orgId, table.userId),
}));

export const orgRegistrationsTable = pgTable("org_registrations", {
  id: text("id").primaryKey(),
  orgName: text("org_name").notNull(),
  type: text("type").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  size: text("size"),
  purpose: text("purpose"),
  status: text("status").notNull().default("pending"),
  inviteCode: text("invite_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgMatchRatesTable = pgTable("org_match_rates", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 4 }),
  donationMultiplier: numeric("donation_multiplier", { precision: 10, scale: 4 }),
  monthlyCapPerMember: numeric("monthly_cap_per_member", { precision: 12, scale: 2 }),
  onlyVerifiedHours: boolean("only_verified_hours").notNull().default(false),
  effectiveFrom: timestamp("effective_from").notNull(),
  effectiveTo: timestamp("effective_to"),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Organisation = typeof organisationsTable.$inferSelect;
export type OrgMember = typeof orgMembersTable.$inferSelect;
export type OrgRegistration = typeof orgRegistrationsTable.$inferSelect;
export type OrgMatchRate = typeof orgMatchRatesTable.$inferSelect;
