import { pgTable, text, timestamp, boolean, serial, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  emailDigestOptIn: boolean("email_digest_opt_in").default(true).notNull(),
  unsubscribeToken: text("unsubscribe_token").unique(),
  lastDigestSentAt: timestamp("last_digest_sent_at"),
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
  inviteCode: text("invite_code").unique(),
  inviteSharedAt: timestamp("invite_shared_at"),
  emailOptIn: boolean("email_opt_in").default(true).notNull(),
});

// Tracks the three transactional onboarding emails (Day 1, Day 7, Day 30)
// that follow a magic-link sign-up. The (user_id, step) pair is unique so
// that the daily dispatcher can never double-send the same email even if
// it is run multiple times on the same day.
export const onboardingEmailSendsTable = pgTable(
  "onboarding_email_sends",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => ({
    userStepUniq: uniqueIndex("onboarding_email_sends_user_step_uniq").on(t.userId, t.step),
  })
);

export const pageViewsTable = pgTable("page_views", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  page: text("page").notNull(),
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
});

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id),
  pageUrl: text("page_url"),
  category: text("category"),
  message: text("message").notNull(),
  name: text("name"),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
export type MagicToken = typeof magicTokensTable.$inferSelect;
export type UserProfile = typeof userProfilesTable.$inferSelect;
export type PageView = typeof pageViewsTable.$inferSelect;
export type Feedback = typeof feedbackTable.$inferSelect;
export type OnboardingEmailSend = typeof onboardingEmailSendsTable.$inferSelect;
