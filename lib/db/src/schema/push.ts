import { pgTable, text, serial, jsonb, timestamp, index, boolean } from "drizzle-orm/pg-core";

/**
 * Web Push subscriptions for the My Impact PWA.
 * Each row corresponds to one browser/device subscription.
 */
export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    lastNotifiedAt: timestamp("last_notified_at"),
  },
  (t) => ({
    userIdx: index("push_subscriptions_user_idx").on(t.userId),
  }),
);

/**
 * Per-user push notification preferences. Granular per-trigger toggles
 * plus an overall pause-until timestamp.
 *
 * triggers JSON shape:
 *   { streakAtRisk: bool, recurringDue: bool, monthlyDigest: bool, challengeEnd: bool }
 */
export const pushPreferencesTable = pgTable("push_preferences", {
  userId: text("user_id").primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  pausedUntil: timestamp("paused_until"),
  triggers: jsonb("triggers"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type PushPreference = typeof pushPreferencesTable.$inferSelect;

export interface PushTriggerToggles {
  streakAtRisk: boolean;
  recurringDue: boolean;
  monthlyDigest: boolean;
  challengeEnd: boolean;
}

export const DEFAULT_PUSH_TRIGGERS: PushTriggerToggles = {
  streakAtRisk: true,
  recurringDue: true,
  monthlyDigest: true,
  challengeEnd: true,
};
