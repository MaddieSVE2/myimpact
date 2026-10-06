CREATE TABLE IF NOT EXISTS "org_groups" (
  "id" text PRIMARY KEY,
  "org_id" text NOT NULL CONSTRAINT "org_groups_org_id_organisations_id_fk" REFERENCES "organisations" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "org_groups_org_name_unique" UNIQUE ("org_id", "name")
);
CREATE INDEX IF NOT EXISTS "org_groups_org_idx" ON "org_groups" ("org_id");

CREATE TABLE IF NOT EXISTS "org_group_members" (
  "group_id" text NOT NULL CONSTRAINT "org_group_members_group_id_org_groups_id_fk" REFERENCES "org_groups" ("id") ON DELETE CASCADE,
  "user_id" text NOT NULL CONSTRAINT "org_group_members_user_id_users_id_fk" REFERENCES "users" ("id") ON DELETE CASCADE,
  "role" text DEFAULT 'member' NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "org_group_members_membership_unique" UNIQUE ("group_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "org_group_members_user_idx" ON "org_group_members" ("user_id");

ALTER TABLE "impact_records" ADD COLUMN IF NOT EXISTS "org_group_id" text;
ALTER TABLE "recurring_templates" ADD COLUMN IF NOT EXISTS "sharing_group_id" text;
