-- Persisted short-TTL reservations for in-flight Sidekick AI requests.
-- Replaces the in-process Map so reservations survive process restarts and
-- a parallel burst that begins immediately after a deploy/crash cannot
-- briefly slip past the daily cap.
--
-- Rows are deleted on response finish; a periodic sweep deletes any rows
-- whose expires_at has passed (process crashes, dropped close events).
-- See lib/db/src/schema/ai-inflight-reservations.ts and
-- artifacts/api-server/src/lib/aiUsage.ts.
CREATE TABLE IF NOT EXISTS "ai_inflight_reservations" (
  "id"         SERIAL PRIMARY KEY,
  "user_key"   TEXT      NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ai_inflight_user_key_expires_idx"
  ON "ai_inflight_reservations" ("user_key", "expires_at");
CREATE INDEX IF NOT EXISTS "ai_inflight_expires_at_idx"
  ON "ai_inflight_reservations" ("expires_at");
