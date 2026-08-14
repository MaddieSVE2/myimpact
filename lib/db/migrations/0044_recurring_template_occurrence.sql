-- Recurring activities as reminders: templates gain per-occurrence defaults
-- (normal quantity/hours for ONE occurrence), a usual location, an org-sharing
-- preference, and a last-skipped timestamp so the due prompt can be dismissed
-- without creating any records.
--
-- Existing templates keep working: when occurrence_activities is NULL the
-- server derives sensible per-occurrence defaults from the stored annual
-- default_activities divided by the cadence's occurrences per year.

ALTER TABLE recurring_templates
  ADD COLUMN IF NOT EXISTS occurrence_activities jsonb;

ALTER TABLE recurring_templates
  ADD COLUMN IF NOT EXISTS occurrence_donations_gbp numeric(12,2);

ALTER TABLE recurring_templates
  ADD COLUMN IF NOT EXISTS usual_location_json jsonb;

ALTER TABLE recurring_templates
  ADD COLUMN IF NOT EXISTS sharing_org_id text;

ALTER TABLE recurring_templates
  ADD COLUMN IF NOT EXISTS last_skipped_at timestamp;
