import { pgTable, text, timestamp, integer, primaryKey, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Per-user, per-month tally of Sidekick voice consumption. Voice features
 * (transcription + text-to-speech) hit OpenAI's paid audio APIs on every
 * use, so we track usage explicitly to (a) enforce a monthly cap and
 * (b) make it easy to estimate spend.
 *
 * The composite PK on (user_id, year_month) means the row for the current
 * month is upserted on every voice call. Old months are kept indefinitely
 * for historical reporting; we only ever read the current month for cap
 * enforcement.
 */
export const voiceUsageTable = pgTable(
  "voice_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    transcribeSeconds: integer("transcribe_seconds").default(0).notNull(),
    ttsCharacters: integer("tts_characters").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.yearMonth] }),
    yearMonthIdx: index("voice_usage_year_month_idx").on(t.yearMonth),
  })
);

export type VoiceUsage = typeof voiceUsageTable.$inferSelect;
