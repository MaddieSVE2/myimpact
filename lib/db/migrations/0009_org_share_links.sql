CREATE TABLE IF NOT EXISTS org_share_links (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL DEFAULT 'all',
  funder_label TEXT,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_share_links_org_idx ON org_share_links (org_id);
