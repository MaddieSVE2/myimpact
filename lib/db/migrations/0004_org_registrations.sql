CREATE TABLE IF NOT EXISTS "org_registrations" (
  "id" text PRIMARY KEY NOT NULL,
  "org_name" text NOT NULL,
  "type" text NOT NULL,
  "contact_name" text NOT NULL,
  "contact_email" text NOT NULL,
  "size" text,
  "purpose" text,
  "status" text NOT NULL DEFAULT 'pending',
  "invite_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
