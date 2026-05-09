-- Per-org summary period start: stores a "MM-DD" string (e.g. "01-01" for
-- calendar year, "09-01" for academic year, "04-01" for financial year).
-- Defaults to "01-01" (calendar year) so existing orgs are unaffected.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS summary_year_start text NOT NULL DEFAULT '01-01';
