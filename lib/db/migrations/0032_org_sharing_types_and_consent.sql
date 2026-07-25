-- Organisation data-sharing types, super-admin management fields and member consent.
-- Existing organisations default to 'explicit_submission' (current behaviour).
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS data_sharing_mode text NOT NULL DEFAULT 'explicit_submission';
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS revoked_at timestamp;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS dashboard_sections jsonb;

-- Backfill contact details from approved registrations where possible.
UPDATE organisations o
SET contact_name = r.contact_name,
    contact_email = r.contact_email
FROM org_registrations r
WHERE r.invite_code = o.invite_code
  AND r.status = 'approved'
  AND o.contact_email IS NULL;

CREATE TABLE IF NOT EXISTS org_member_consents (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active',
  share_from timestamp NOT NULL,
  share_scope text NOT NULL,
  granted_at timestamp NOT NULL DEFAULT now(),
  withdrawn_at timestamp,
  CONSTRAINT org_member_consents_member_unique UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS org_member_consents_org_idx ON org_member_consents(org_id);
