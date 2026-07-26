-- Evidence policy for member activity submissions: 'required' | 'optional' | 'not_required'.
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS evidence_policy text NOT NULL DEFAULT 'optional';
