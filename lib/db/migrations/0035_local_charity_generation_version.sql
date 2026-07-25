-- Track which pipeline version generated each area's stored suggestions.
-- Existing rows default to 1 (pre-website pipeline) so the refresh sweep
-- re-generates them promptly now that v2 includes website URLs.
ALTER TABLE "local_charity_areas"
  ADD COLUMN IF NOT EXISTS "generation_version" integer NOT NULL DEFAULT 1;
