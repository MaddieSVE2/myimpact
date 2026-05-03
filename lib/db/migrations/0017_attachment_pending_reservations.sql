-- Tracks presigned upload URLs that have been issued but not yet registered.
-- Each row reserves quota so concurrent /upload-url calls cannot race past
-- the per-user storage cap by all reading the same stale usage figure before
-- any upload completes.
--
-- Rows are released immediately on /register, and are swept by a periodic
-- cleanup job after they pass their expires_at timestamp (= signed-URL TTL).
CREATE TABLE IF NOT EXISTS attachment_pending_reservations (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  storage_key TEXT        NOT NULL,
  byte_size   INTEGER     NOT NULL,
  expires_at  TIMESTAMP   NOT NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT att_pending_storage_key_unique UNIQUE (storage_key)
);

CREATE INDEX IF NOT EXISTS att_pending_user_idx
  ON attachment_pending_reservations (user_id);
