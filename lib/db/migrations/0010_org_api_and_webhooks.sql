-- Org API keys. Raw keys are never stored: we keep sha256(key) only, and the
-- first 8 chars of the raw key as a UI prefix for "mi_orgk_abcd1234…".
CREATE TABLE IF NOT EXISTS "org_api_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "key_prefix" text NOT NULL,
  "scopes" text[] NOT NULL DEFAULT ARRAY['hours.write','members.read','stats.read']::text[],
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "org_api_keys_org_idx" ON "org_api_keys" ("org_id");

-- Outbound webhook subscriptions. The secret is generated server-side and
-- used to sign delivery payloads with HMAC-SHA256.
CREATE TABLE IF NOT EXISTS "org_webhooks" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "secret" text NOT NULL,
  "events" text[] NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "dead_at" timestamp,
  "last_success_at" timestamp,
  "last_failure_at" timestamp,
  "last_error" text,
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "org_webhooks_org_idx" ON "org_webhooks" ("org_id");

-- Per-attempt delivery queue.
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "webhook_id" text NOT NULL REFERENCES "org_webhooks"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp NOT NULL DEFAULT NOW(),
  "first_attempt_at" timestamp,
  "last_attempt_at" timestamp,
  "delivered_at" timestamp,
  "last_response_status" integer,
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "webhook_deliveries_pending_idx" ON "webhook_deliveries" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_idx" ON "webhook_deliveries" ("webhook_id");

-- Org-attestation fields on impact_records.
ALTER TABLE "impact_records" ADD COLUMN IF NOT EXISTS "attested_by_api_key_id" text;
ALTER TABLE "impact_records" ADD COLUMN IF NOT EXISTS "attested_at" timestamp;
ALTER TABLE "impact_records" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'user';
