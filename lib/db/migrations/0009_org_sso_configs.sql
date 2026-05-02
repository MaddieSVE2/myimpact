-- Per-organisation SSO configuration. Each org can configure at most one
-- SSO provider per domain. When `enforce_sso` is true, magic-link sign-in
-- is blocked for that domain and users must complete the OIDC handshake
-- with the configured provider.
CREATE TABLE IF NOT EXISTS org_sso_configs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  domain text NOT NULL,
  tenant_id text,
  enforce_sso boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  last_test_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- One config per (org, domain). A domain can only be configured once
-- across the whole platform (otherwise sign-in is ambiguous).
CREATE UNIQUE INDEX IF NOT EXISTS org_sso_configs_org_domain_uniq
  ON org_sso_configs (org_id, domain);
CREATE UNIQUE INDEX IF NOT EXISTS org_sso_configs_domain_uniq
  ON org_sso_configs (domain);
CREATE INDEX IF NOT EXISTS org_sso_configs_org_idx
  ON org_sso_configs (org_id);

-- Constrain provider to known values.
ALTER TABLE org_sso_configs
  ADD CONSTRAINT org_sso_configs_provider_check
  CHECK (provider IN ('google', 'microsoft'));
