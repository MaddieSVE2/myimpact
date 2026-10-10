CREATE TABLE IF NOT EXISTS "email_activity_messages" (
  "id" serial PRIMARY KEY,
  "resend_received_id" text NOT NULL CONSTRAINT "email_activity_messages_resend_received_id_unique" UNIQUE,
  "from_address" text NOT NULL,
  "user_id" text,
  "subject" text NOT NULL,
  "text_body" text,
  "outcome" text,
  "note" text,
  "question" text,
  "record_ids" integer[],
  "received_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "email_activity_messages_from_received_idx" ON "email_activity_messages" ("from_address", "received_at");
