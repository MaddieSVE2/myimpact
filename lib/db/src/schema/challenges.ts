import { pgTable, text, timestamp, numeric, primaryKey, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { organisationsTable, orgGroupsTable } from "./org";

export const challengesTable = pgTable("challenges", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  goalType: text("goal_type").notNull(),
  target: numeric("target", { precision: 12, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "set null" }),
  orgId: text("org_id").references(() => organisationsTable.id),
  scope: text("scope").notNull(),
  departmentTag: text("department_tag"),
  inviteCode: text("invite_code").notNull().unique(),
  endSummarySentAt: timestamp("end_summary_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const challengeParticipantsTable = pgTable(
  "challenge_participants",
  {
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challengesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.challengeId, t.userId] }),
    userIdx: index("challenge_participants_user_idx").on(t.userId),
  })
);

/**
 * The groups an organisation challenge is for. None = the whole organisation.
 * Members of these groups take part, including people who join them later.
 */
export const challengeGroupsTable = pgTable(
  "challenge_groups",
  {
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challengesTable.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => orgGroupsTable.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.challengeId, t.groupId] }),
    groupIdx: index("challenge_groups_group_idx").on(t.groupId),
  })
);

export type Challenge = typeof challengesTable.$inferSelect;
export type ChallengeParticipant = typeof challengeParticipantsTable.$inferSelect;
