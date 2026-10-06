CREATE TABLE IF NOT EXISTS "email_replies" (
  "id" serial PRIMARY KEY,
  "resend_received_id" text NOT NULL CONSTRAINT "email_replies_resend_received_id_unique" UNIQUE,
  "email_log_id" integer CONSTRAINT "email_replies_email_log_id_email_log_id_fk" REFERENCES "email_log" ("id") ON DELETE SET NULL,
  "from_address" text NOT NULL,
  "subject" text NOT NULL,
  "text_body" text,
  "forward_status" text,
  "received_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "email_replies_received_at_idx" ON "email_replies" ("received_at");
CREATE INDEX IF NOT EXISTS "email_replies_from_idx" ON "email_replies" ("from_address");
