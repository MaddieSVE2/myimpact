-- Per-user, per-month tally of text AI usage for enforcing monthly request
-- caps across all paid text-AI routes (Sidekick chat, custom-activity AI,
-- local-charities AI fallback). See lib/db/src/schema/text-ai-usage.ts.
CREATE TABLE IF NOT EXISTS "text_ai_usage" (
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "year_month" TEXT NOT NULL,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "year_month")
);

CREATE INDEX IF NOT EXISTS "text_ai_usage_year_month_idx"
  ON "text_ai_usage" ("year_month");
