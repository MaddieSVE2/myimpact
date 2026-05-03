CREATE TABLE IF NOT EXISTS record_verifications (
  id SERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES impact_records(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  status TEXT NOT NULL DEFAULT 'pending',
  verified_by TEXT REFERENCES users(id),
  decided_at TIMESTAMP,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT record_verifications_record_org_unique UNIQUE (record_id, org_id),
  CONSTRAINT record_verifications_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS record_verifications_org_status_idx ON record_verifications (org_id, status);

CREATE TABLE IF NOT EXISTS org_audit_log (
  id SERIAL PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_audit_log_org_idx ON org_audit_log (org_id, created_at);
