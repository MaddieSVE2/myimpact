-- Per-caller (user/ip/session), per-day, per-model tally of Sidekick AI
-- usage used for tiered quota enforcement and the admin spend dashboard.
-- See lib/db/src/schema/ai-usage.ts.
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "user_key" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "model" TEXT NOT NULL,
  "question_count" INTEGER NOT NULL DEFAULT 0,
  "tool_calls" INTEGER NOT NULL DEFAULT 0,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_key", "date", "model")
);

CREATE INDEX IF NOT EXISTS "ai_usage_date_idx" ON "ai_usage" ("date");
CREATE INDEX IF NOT EXISTS "ai_usage_user_key_idx" ON "ai_usage" ("user_key");

-- Single-row state for the daily AI budget alert cron, so the 24h cooldown
-- survives process restarts. Keyed by short string for future alert types.
CREATE TABLE IF NOT EXISTS "ai_alert_state" (
  "key" TEXT PRIMARY KEY,
  "last_sent_at" TIMESTAMP NOT NULL
);
