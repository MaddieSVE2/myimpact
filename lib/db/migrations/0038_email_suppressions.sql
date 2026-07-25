CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  reason TEXT,
  first_event_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMP NOT NULL DEFAULT NOW()
);
