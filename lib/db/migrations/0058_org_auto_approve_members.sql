ALTER TABLE organisations ADD COLUMN IF NOT EXISTS auto_approve_members boolean NOT NULL DEFAULT false;
