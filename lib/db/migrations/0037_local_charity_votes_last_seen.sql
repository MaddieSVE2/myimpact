-- Track when a vote's charity was last present in the area's stored
-- suggestions, so the daily sweep can delete votes for charities that
-- disappeared for good (absent beyond a 90-day grace period).
ALTER TABLE "local_charity_votes"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp NOT NULL DEFAULT now();
