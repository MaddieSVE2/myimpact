-- Challenges and pulse surveys can be for chosen groups, and managers can
-- save group places for people who aren't active members yet.
CREATE TABLE IF NOT EXISTS "challenge_groups" (
  "challenge_id" text NOT NULL CONSTRAINT "challenge_groups_challenge_id_challenges_id_fk" REFERENCES "challenges" ("id") ON DELETE CASCADE,
  "group_id" text NOT NULL CONSTRAINT "challenge_groups_group_id_org_groups_id_fk" REFERENCES "org_groups" ("id") ON DELETE CASCADE,
  CONSTRAINT "challenge_groups_challenge_id_group_id_pk" PRIMARY KEY ("challenge_id", "group_id")
);
CREATE INDEX IF NOT EXISTS "challenge_groups_group_idx" ON "challenge_groups" ("group_id");

CREATE TABLE IF NOT EXISTS "org_survey_groups" (
  "survey_id" text NOT NULL CONSTRAINT "org_survey_groups_survey_id_org_surveys_id_fk" REFERENCES "org_surveys" ("id") ON DELETE CASCADE,
  "group_id" text NOT NULL CONSTRAINT "org_survey_groups_group_id_org_groups_id_fk" REFERENCES "org_groups" ("id") ON DELETE CASCADE,
  CONSTRAINT "org_survey_groups_unique" UNIQUE ("survey_id", "group_id")
);
CREATE INDEX IF NOT EXISTS "org_survey_groups_group_idx" ON "org_survey_groups" ("group_id");

CREATE TABLE IF NOT EXISTS "org_pending_group_members" (
  "org_id" text NOT NULL CONSTRAINT "org_pending_group_members_org_id_organisations_id_fk" REFERENCES "organisations" ("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "group_id" text NOT NULL CONSTRAINT "org_pending_group_members_group_id_org_groups_id_fk" REFERENCES "org_groups" ("id") ON DELETE CASCADE,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "org_pending_group_members_unique" UNIQUE ("org_id", "email", "group_id")
);
