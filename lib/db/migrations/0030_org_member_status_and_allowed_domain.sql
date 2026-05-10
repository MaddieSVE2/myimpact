ALTER TABLE org_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE org_members ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS allowed_domain text;
