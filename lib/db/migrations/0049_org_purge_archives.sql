-- Archive table written by the revoked-organisation purge job before it
-- deletes an org's data at the end of the 180-day retention window.
CREATE TABLE IF NOT EXISTS "org_purge_archives" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "org_name" text NOT NULL,
  "revoked_at" timestamp NOT NULL,
  "snapshot" jsonb NOT NULL,
  "counts" jsonb NOT NULL,
  "purged_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "org_purge_archives_org_idx" ON "org_purge_archives" ("org_id");
