ALTER TABLE organisations ADD COLUMN IF NOT EXISTS auto_verify_activities boolean NOT NULL DEFAULT false;
-- Allow a user to belong to more than one organisation (e.g. the student
-- persona is a member of both the Demo Organisation and My Impact University).
-- Membership uniqueness per org is still enforced by org_members_membership_unique.
ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_user_unique;
