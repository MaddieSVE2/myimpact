ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS evidence_policy text NOT NULL DEFAULT 'optional';
