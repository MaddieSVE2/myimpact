-- Optional per-line-item breakdown of the per-volunteer SROI cost.
-- Power-user managers (e.g. larger charities) split the total into
-- recruitment / onboarding / support / admin so it's auditable and
-- they can justify it to funders. Each column is in whole pounds and
-- may be NULL independently. When at least one is set, the existing
-- sroi_cost_per_volunteer column is updated to be the derived sum.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS sroi_cost_recruitment INTEGER,
  ADD COLUMN IF NOT EXISTS sroi_cost_onboarding  INTEGER,
  ADD COLUMN IF NOT EXISTS sroi_cost_support     INTEGER,
  ADD COLUMN IF NOT EXISTS sroi_cost_admin       INTEGER;
