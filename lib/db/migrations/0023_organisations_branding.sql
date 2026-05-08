-- Per-organisation branding: an uploaded logo (object storage key) plus a
-- primary and accent brand colour. All optional — orgs without branding fall
-- back to the default My Impact look. Managed from /org/settings → Org profile.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS logo_key TEXT,
  ADD COLUMN IF NOT EXISTS brand_primary TEXT,
  ADD COLUMN IF NOT EXISTS brand_accent TEXT;
