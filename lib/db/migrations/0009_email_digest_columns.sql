-- Backfill columns for the email-digest opt-in/unsubscribe feature
-- that were added to the schema but never migrated.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_digest_opt_in BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS users_unsubscribe_token_unique
  ON users(unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;
