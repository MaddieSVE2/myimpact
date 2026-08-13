-- Contribution data model: estimate-vs-actual kind, structured activity
-- location, and derived reporting period on impact_records.
--
-- Existing rows are deliberately marked kind='legacy' so every aggregation
-- surface keeps summing them exactly as before (historical totals unchanged).
-- reporting_year is backfilled from entry_date (calendar-year periods).

ALTER TABLE impact_records
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legacy';

ALTER TABLE impact_records
  ADD COLUMN IF NOT EXISTS location_json jsonb;

ALTER TABLE impact_records
  ADD COLUMN IF NOT EXISTS reporting_year integer;

UPDATE impact_records
SET reporting_year = EXTRACT(YEAR FROM entry_date)::int
WHERE reporting_year IS NULL;

CREATE INDEX IF NOT EXISTS impact_records_user_kind_year_idx
  ON impact_records (user_id, kind, reporting_year);
