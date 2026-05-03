-- Adds a per-user toggle for showing milestone / streak / badge gamification UI.
-- Defaults to TRUE so existing users continue to see badges and streaks until
-- they opt out.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gamification_enabled BOOLEAN NOT NULL DEFAULT TRUE;
