-- Pulse surveys
CREATE TABLE IF NOT EXISTS org_surveys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  question TEXT NOT NULL,
  schedule TEXT NOT NULL,
  anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS org_surveys_org_idx ON org_surveys(org_id);

CREATE TABLE IF NOT EXISTS org_survey_responses (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES org_surveys(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  window_key TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT org_survey_responses_user_window_unique UNIQUE (survey_id, user_id, window_key)
);

CREATE INDEX IF NOT EXISTS org_survey_responses_survey_idx ON org_survey_responses(survey_id);

CREATE TABLE IF NOT EXISTS org_survey_opt_outs (
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT org_survey_opt_outs_pk UNIQUE (org_id, user_id)
);
