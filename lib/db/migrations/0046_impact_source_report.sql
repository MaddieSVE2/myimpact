-- Report-sourced org submissions ("Review & share" flow): link the org copy
-- back to the member's saved Full Impact Report so twin exclusion and
-- personal dedupe can key off a first-class column instead of resultJson.
ALTER TABLE impact_records
  ADD COLUMN IF NOT EXISTS source_report_id integer REFERENCES impact_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS impact_records_source_report_idx
  ON impact_records (source_report_id) WHERE source_report_id IS NOT NULL;
