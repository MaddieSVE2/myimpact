-- Super-admin org data export/import: provenance + restored historical activity.

CREATE TABLE IF NOT EXISTS org_migrations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  source_org_id TEXT NOT NULL,
  source_org_name TEXT NOT NULL,
  source_data_sharing_mode TEXT NOT NULL,
  exported_at TIMESTAMP NOT NULL,
  imported_by TEXT NOT NULL REFERENCES users(id),
  members_in_source INTEGER NOT NULL DEFAULT 0,
  activities_imported INTEGER NOT NULL DEFAULT 0,
  survey_aggregates JSONB,
  settings_applied JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_migrations_org_idx ON org_migrations(org_id);

CREATE TABLE IF NOT EXISTS org_migrated_activities (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  migration_id TEXT NOT NULL REFERENCES org_migrations(id) ON DELETE CASCADE,
  source_record_id TEXT NOT NULL,
  member_name TEXT,
  member_email TEXT,
  entry_date TIMESTAMP NOT NULL,
  name TEXT NOT NULL,
  total_value NUMERIC(12, 2) NOT NULL,
  total_hours INTEGER NOT NULL,
  source TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status TEXT,
  activities_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_migrated_activities_org_idx ON org_migrated_activities(org_id);
CREATE INDEX IF NOT EXISTS org_migrated_activities_migration_idx ON org_migrated_activities(migration_id);
