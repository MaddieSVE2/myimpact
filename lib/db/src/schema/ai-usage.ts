import { pgTable, text, timestamp, integer, date, primaryKey, index } from "drizzle-orm/pg-core";

/**
 * Per-caller, per-day, per-model tally of Sidekick AI usage. The caller is
 * identified by a "user key" string of the form `user:<id>`, `ip:<addr>` or
 * `sess:<id>` so that anonymous traffic is tracked too. See
 * `artifacts/api-server/src/lib/aiUsage.ts` for the helpers that read and
 * write this table.
 *
 * The composite PK on (user_key, date, model) means today's row is upserted
 * on every Sidekick chat call. Daily rows are kept indefinitely; quota
 * enforcement reads only today's row plus the sum of the current UTC month.
 */
export const aiUsageTable = pgTable(
  "ai_usage",
  {
    userKey: text("user_key").notNull(),
    date: date("date").notNull(),
    model: text("model").notNull(),
    questionCount: integer("question_count").default(0).notNull(),
    toolCalls: integer("tool_calls").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userKey, t.date, t.model] }),
    dateIdx: index("ai_usage_date_idx").on(t.date),
    userKeyIdx: index("ai_usage_user_key_idx").on(t.userKey),
  })
);

export type AiUsage = typeof aiUsageTable.$inferSelect;

/**
 * Single-row state table used to track when the most recent AI spend alert
 * email was sent. Persisted in the DB so the 24h cooldown survives process
 * restarts. Keyed by a short string (e.g. `monthly_budget`) so additional
 * alert types can be added later without a schema change.
 */
export const aiAlertStateTable = pgTable("ai_alert_state", {
  key: text("key").primaryKey(),
  lastSentAt: timestamp("last_sent_at").notNull(),
});

export type AiAlertState = typeof aiAlertStateTable.$inferSelect;
