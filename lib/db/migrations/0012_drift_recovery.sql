-- Backfill migrations for tables/columns that previously relied on
-- drizzle-kit push for schema sync. Going forward, every schema change
-- must ship with a SQL migration; the post-merge script no longer runs
-- drizzle-kit push (see scripts/post-merge.sh and lib/db/drizzle.config.ts).

-- attachments (Attachments component, evidence pack uploads)
CREATE TABLE IF NOT EXISTS "attachments" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL,
  "record_id" integer,
  "journal_id" integer,
  "kind" text NOT NULL,
  "storage_key" text NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "attachments_user_idx" ON "attachments" ("user_id");
CREATE INDEX IF NOT EXISTS "attachments_record_idx" ON "attachments" ("record_id");
CREATE INDEX IF NOT EXISTS "attachments_journal_idx" ON "attachments" ("journal_id");

-- conversations (Sidekick chat history container)
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- messages (individual Sidekick chat messages)
CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY,
  "conversation_id" integer NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Sidekick voice mode preferences on users (Task #150)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "voice_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "voice_persona" text NOT NULL DEFAULT 'alloy';
