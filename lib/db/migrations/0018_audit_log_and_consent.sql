-- GDPR-related audit log: records personal-data export and account deletion
-- actions taken by users (or by admins/system on their behalf), so we have
-- a small, retained trail without storing the data itself.
CREATE TABLE IF NOT EXISTS user_audit_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_audit_log_user_idx ON user_audit_log(user_id);
CREATE INDEX IF NOT EXISTS user_audit_log_action_idx ON user_audit_log(action);
CREATE INDEX IF NOT EXISTS user_audit_log_created_at_idx ON user_audit_log(created_at);

-- Capture when and where the user gave (or withdrew) consent for non-essential
-- onboarding emails. Existing rows are left as NULL — they migrated in before
-- the consent field existed and rely on the legacy `email_opt_in` flag.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS marketing_consent_source TEXT;

-- Relax foreign keys that would otherwise block account deletion. We keep
-- aggregate-relevant rows (org audit trail, match rates, challenge owners,
-- verification metadata) by setting the user reference to NULL after the
-- user is gone. Per-user share links are removed via cascade.
ALTER TABLE org_audit_log ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE org_audit_log DROP CONSTRAINT IF EXISTS org_audit_log_actor_user_id_fkey;
ALTER TABLE org_audit_log
  ADD CONSTRAINT org_audit_log_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE org_match_rates ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE org_match_rates DROP CONSTRAINT IF EXISTS org_match_rates_created_by_fkey;
ALTER TABLE org_match_rates
  ADD CONSTRAINT org_match_rates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE org_share_links DROP CONSTRAINT IF EXISTS org_share_links_created_by_user_id_fkey;
ALTER TABLE org_share_links
  ADD CONSTRAINT org_share_links_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_owner_id_fkey;
ALTER TABLE challenges
  ADD CONSTRAINT challenges_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE record_verifications DROP CONSTRAINT IF EXISTS record_verifications_verified_by_fkey;
ALTER TABLE record_verifications
  ADD CONSTRAINT record_verifications_verified_by_fkey
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;
