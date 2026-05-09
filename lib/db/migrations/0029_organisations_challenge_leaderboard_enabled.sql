ALTER TABLE organisations ADD COLUMN IF NOT EXISTS challenge_leaderboard_enabled boolean NOT NULL DEFAULT true;
