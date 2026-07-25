ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS full_tier_enabled boolean NOT NULL DEFAULT false;
