-- Per-user, per-month tally of Sidekick voice usage so we can enforce a
-- monthly cap and estimate cost. See lib/db/src/schema/voice-usage.ts.
CREATE TABLE IF NOT EXISTS "voice_usage" (
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "year_month" TEXT NOT NULL,
  "transcribe_seconds" INTEGER NOT NULL DEFAULT 0,
  "tts_characters" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "year_month")
);

CREATE INDEX IF NOT EXISTS "voice_usage_year_month_idx"
  ON "voice_usage" ("year_month");
