ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_digest_opt_in" boolean NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unsubscribe_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_digest_sent_at" timestamp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_unsubscribe_token_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'users_unsubscribe_token_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_unsubscribe_token_unique" UNIQUE ("unsubscribe_token");
  END IF;
END $$;
