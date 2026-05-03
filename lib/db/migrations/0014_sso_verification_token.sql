ALTER TABLE org_sso_configs
  ADD COLUMN IF NOT EXISTS verification_token TEXT;
