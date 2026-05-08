-- Member-submitted impact records: when an org member uses the dedicated
-- "Submit activities to your organisation" flow, the resulting record is
-- attributed to their org (auto-accepted into org totals) and tagged with
-- source='member-submitted'. These two columns track which org the record
-- was submitted to and when, so the link survives even if the member
-- subsequently leaves the org.
ALTER TABLE impact_records
  ADD COLUMN IF NOT EXISTS submitted_to_org_id TEXT,
  ADD COLUMN IF NOT EXISTS submitted_to_org_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS impact_records_submitted_to_org_idx
  ON impact_records (submitted_to_org_id, submitted_to_org_at);
