-- Account deletion was refused by the database for anyone who had sent an
-- organisation invitation that was still pending, or had run an organisation
-- import: both columns below pointed at users(id) with a plain foreign key,
-- so the users row could not be deleted while such a row existed.
--
-- Same answer as migrations 0018/0019 gave for surveys, API keys, webhooks
-- and the audit log: keep the organisation's row, forget who the actor was.
--
--   org_invites.invited_by_user_id — the invitation stays on the pending
--     list, so other managers can still resend or revoke it.
--   org_migrations.imported_by — the import record stays. It must: the
--     organisation's imported history (org_migrated_activities) is deleted
--     with its import record.
--
-- Safe to run more than once.

ALTER TABLE org_invites ALTER COLUMN invited_by_user_id DROP NOT NULL;
ALTER TABLE org_migrations ALTER COLUMN imported_by DROP NOT NULL;

-- Replace whatever foreign key each column has now with one that blanks the
-- column when the user is deleted. The existing key is found by what it does
-- rather than by name, because its name depends on how the table was made
-- (*_fkey from the numbered migrations, *_users_id_fk from a schema push).
DO $$
DECLARE
  r RECORD;
  c RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('org_invites',    'invited_by_user_id', 'org_invites_invited_by_user_id_users_id_fk'),
      ('org_migrations', 'imported_by',        'org_migrations_imported_by_users_id_fk')
    ) AS t(tbl, col, drizzle_name)
  LOOP
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
      WHERE con.conrelid = r.tbl::regclass
        AND con.contype = 'f'
        AND con.confrelid = 'users'::regclass
        AND array_length(con.conkey, 1) = 1
        AND a.attname = r.col
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tbl, c.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE SET NULL',
      r.tbl, r.drizzle_name, r.col
    );
  END LOOP;
END $$;
