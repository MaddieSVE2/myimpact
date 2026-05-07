-- Org-level toggle controlling whether members of an organisation see and can
-- use the in-app AI Sidekick. Defaults to TRUE so existing orgs keep the
-- feature on; the org manager can flip it from /org/settings → AI features.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS ai_sidekick_enabled BOOLEAN NOT NULL DEFAULT TRUE;
