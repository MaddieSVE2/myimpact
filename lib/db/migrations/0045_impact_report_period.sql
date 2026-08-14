-- Authoritative Full Impact Report period (task: one report period).
-- Nullable on purpose: legacy rows keep NULL and aggregate exactly as before.
ALTER TABLE impact_records ADD COLUMN IF NOT EXISTS report_start_date timestamp;
ALTER TABLE impact_records ADD COLUMN IF NOT EXISTS report_end_date timestamp;
ALTER TABLE impact_records ADD COLUMN IF NOT EXISTS report_period_type text;
