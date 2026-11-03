CREATE TABLE IF NOT EXISTS "org_deactivated_members" (
  "org_id" text NOT NULL CONSTRAINT "org_deactivated_members_org_id_organisations_id_fk" REFERENCES "organisations" ("id") ON DELETE CASCADE,
  "user_id" text NOT NULL CONSTRAINT "org_deactivated_members_user_id_users_id_fk" REFERENCES "users" ("id") ON DELETE CASCADE,
  "role" text DEFAULT 'member' NOT NULL,
  "joined_at" timestamp NOT NULL,
  "groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "deactivated_at" timestamp DEFAULT now() NOT NULL,
  "hours_withdrawn_at" timestamp,
  CONSTRAINT "org_deactivated_members_membership_unique" UNIQUE ("org_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "org_deactivated_members_user_idx" ON "org_deactivated_members" ("user_id");
