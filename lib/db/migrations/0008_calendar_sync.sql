CREATE TABLE IF NOT EXISTS calendar_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  calendar_id TEXT,
  calendar_name TEXT,
  filter_text TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at TIMESTAMP,
  provider_account_email TEXT,
  last_synced_at TIMESTAMP,
  last_sync_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calendar_sources_user_idx ON calendar_sources(user_id);
CREATE INDEX IF NOT EXISTS calendar_sources_status_idx ON calendar_sources(status);

CREATE TABLE IF NOT EXISTS calendar_events (
  id SERIAL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  prompt_status TEXT NOT NULL DEFAULT 'pending',
  prompt_shown_at TIMESTAMP,
  logged_at TIMESTAMP,
  logged_record_id TEXT,
  last_synced_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_source_external_idx
  ON calendar_events(source_id, external_id);
CREATE INDEX IF NOT EXISTS calendar_events_user_starts_idx
  ON calendar_events(user_id, starts_at);
CREATE INDEX IF NOT EXISTS calendar_events_prompt_idx
  ON calendar_events(user_id, prompt_status, ends_at);
