CREATE TABLE IF NOT EXISTS recurring_templates (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  cadence TEXT NOT NULL,
  day_of_period INTEGER NOT NULL,
  anchor_date TIMESTAMP NOT NULL DEFAULT NOW(),
  default_activities JSONB NOT NULL,
  default_donations_gbp NUMERIC(12, 2) NOT NULL DEFAULT 0,
  last_confirmed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recurring_templates_user_idx ON recurring_templates (user_id);

ALTER TABLE recurring_templates
  ADD CONSTRAINT recurring_templates_cadence_check
  CHECK (cadence IN ('weekly', 'fortnightly', 'monthly'));
