-- Per-organisation SROI cost-per-volunteer used in the dashboard SROI explainer.
-- Different orgs have very different per-volunteer costs (recruitment, onboarding,
-- support, admin), so this is configurable per-org from /org/settings → Org profile.
-- NULL means "use the application default" (currently £475).
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS sroi_cost_per_volunteer INTEGER;
