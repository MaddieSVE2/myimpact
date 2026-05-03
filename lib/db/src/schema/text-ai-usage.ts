import { pgTable, text, timestamp, integer, primaryKey, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Per-user, per-month tally of text AI consumption (chat completions).
 * All paid text-AI routes (Sidekick chat, custom-activity analyse/parse,
 * local-charities AI fallback) increment this table so we can enforce a
 * monthly per-user request cap and estimate spend.
 *
 * The composite PK on (user_id, year_month) means the row for the current
 * month is upserted on every AI call. Old months are kept for historical
 * reporting; only the current month is read for cap enforcement.
 */
export const textAiUsageTable = pgTable(
  "text_ai_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.yearMonth] }),
    yearMonthIdx: index("text_ai_usage_year_month_idx").on(t.yearMonth),
  })
);

export type TextAiUsage = typeof textAiUsageTable.$inferSelect;
