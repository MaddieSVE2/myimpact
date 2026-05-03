-- Adds the column that tracks the highest streak milestone the user has
-- already acknowledged, so we don't re-show the same celebration toast.
-- Schema (lib/db/src/schema/auth.ts) declares this as NOT NULL DEFAULT 0;
-- existing rows backfill to 0 via the default.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_acked_streak_milestone INTEGER NOT NULL DEFAULT 0;
