CREATE TABLE IF NOT EXISTS "org_invites" (
  "id" text PRIMARY KEY,
  "org_id" text NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "invited_by_user_id" text NOT NULL REFERENCES "users"("id"),
  "sent_at" timestamp DEFAULT now() NOT NULL,
  "resent_at" timestamp,
  CONSTRAINT "org_invites_org_email_unique" UNIQUE ("org_id", "email")
);
CREATE INDEX IF NOT EXISTS "org_invites_org_idx" ON "org_invites" ("org_id");
