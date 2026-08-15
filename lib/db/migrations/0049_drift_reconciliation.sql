-- Drift reconciliation (2026-08-15): brings any environment in line with
-- lib/db/src/schema/* so `drizzle-kit push` runs clean with no prompts.
-- All statements are idempotent.

-- 1. Retire the legacy opportunities table (rows archived in
--    lib/db/archives/opportunities-2026-08-15.json before the drop in dev).
DROP TABLE IF EXISTS opportunities;

-- 2. Unique constraints under the names the Drizzle schema expects.
--    Environments created via numbered migrations may already hold an
--    equivalent constraint under a default name (e.g. *_key); rename it
--    rather than stacking a second unique index. Only add when no
--    single-column unique constraint on the column exists at all.
DO $$
DECLARE
  r RECORD;
  existing TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('org_share_links', 'slug',        'org_share_links_slug_unique'),
      ('challenges',      'invite_code', 'challenges_invite_code_unique')
    ) AS t(tbl, col, want_name)
  LOOP
    SELECT c.conname INTO existing
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = r.tbl::regclass
      AND c.contype = 'u'
      AND array_length(c.conkey, 1) = 1
      AND a.attname = r.col
    LIMIT 1;

    IF existing IS NULL THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (%I)', r.tbl, r.want_name, r.col);
    ELSIF existing <> r.want_name THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r.tbl, existing, r.want_name);
    END IF;
  END LOOP;
END $$;

-- 3. user_profiles.situation is text[] in the schema; older environments
--    created it as text holding array literals.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'situation' AND data_type = 'text'
  ) THEN
    ALTER TABLE user_profiles ALTER COLUMN situation TYPE text[] USING situation::text[];
  END IF;
END $$;

-- 4. GDPR erasure FK behaviours (originally migrations 0018/0019) are now
--    also encoded in the Drizzle schema; this section repairs environments
--    where a schema push replaced them with plain FKs. Idempotent: each FK
--    is dropped (both historical names) and recreated with the intended
--    ON DELETE action, and nullability relaxations are re-asserted.
ALTER TABLE org_audit_log ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE org_match_rates ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE org_api_keys ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE org_webhooks ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE org_surveys ALTER COLUMN created_by DROP NOT NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('org_audit_log',        'actor_user_id',      'org_audit_log_actor_user_id_fkey',        'org_audit_log_actor_user_id_users_id_fk',        'SET NULL'),
      ('org_match_rates',      'created_by',         'org_match_rates_created_by_fkey',         'org_match_rates_created_by_users_id_fk',         'SET NULL'),
      ('org_share_links',      'created_by_user_id', 'org_share_links_created_by_user_id_fkey', 'org_share_links_created_by_user_id_users_id_fk', 'CASCADE'),
      ('challenges',           'owner_id',           'challenges_owner_id_fkey',                'challenges_owner_id_users_id_fk',                'SET NULL'),
      ('record_verifications', 'verified_by',        'record_verifications_verified_by_fkey',   'record_verifications_verified_by_users_id_fk',   'SET NULL'),
      ('org_surveys',          'created_by',         'org_surveys_created_by_fkey',             'org_surveys_created_by_users_id_fk',             'SET NULL'),
      ('org_survey_responses', 'user_id',            'org_survey_responses_user_id_fkey',       'org_survey_responses_user_id_users_id_fk',       'CASCADE'),
      ('org_survey_opt_outs',  'user_id',            'org_survey_opt_outs_user_id_fkey',        'org_survey_opt_outs_user_id_users_id_fk',        'CASCADE'),
      ('org_api_keys',         'created_by',         'org_api_keys_created_by_fkey',            'org_api_keys_created_by_users_id_fk',            'SET NULL'),
      ('org_webhooks',         'created_by',         'org_webhooks_created_by_fkey',            'org_webhooks_created_by_users_id_fk',            'SET NULL')
    ) AS t(tbl, col, legacy_name, drizzle_name, on_delete)
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.legacy_name);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.drizzle_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE %s',
      r.tbl, r.drizzle_name, r.col, r.on_delete
    );
  END LOOP;
END $$;

-- 5. Array-column defaults moved to the application layer ($default in the
--    Drizzle schema) because drizzle-kit push perpetually re-diffs text[]
--    DDL defaults. Drop any lingering DB-level defaults.
ALTER TABLE journal_entries ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE impact_records ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE proxies ALTER COLUMN allowed_units DROP DEFAULT;
