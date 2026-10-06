CREATE TABLE IF NOT EXISTS "email_log" (
  "id" serial PRIMARY KEY,
  "resend_id" text CONSTRAINT "email_log_resend_id_unique" UNIQUE,
  "to_addresses" text[] NOT NULL,
  "subject" text NOT NULL,
  "category" text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "sent_at" timestamp DEFAULT now() NOT NULL,
  "last_event_at" timestamp
);
CREATE INDEX IF NOT EXISTS "email_log_sent_at_idx" ON "email_log" ("sent_at");
CREATE INDEX IF NOT EXISTS "email_log_category_idx" ON "email_log" ("category");
