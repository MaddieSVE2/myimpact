ALTER TABLE org_members ADD CONSTRAINT org_members_role_check CHECK (role IN ('manager', 'member'));
