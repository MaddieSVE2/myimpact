CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  goal_type TEXT NOT NULL,
  target NUMERIC(12, 2) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  owner_id TEXT REFERENCES users(id),
  org_id TEXT REFERENCES organisations(id),
  scope TEXT NOT NULL,
  department_tag TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  end_summary_sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS challenges_owner_idx ON challenges(owner_id);
CREATE INDEX IF NOT EXISTS challenges_org_idx ON challenges(org_id);

ALTER TABLE challenges ADD CONSTRAINT challenges_scope_check CHECK (scope IN ('personal', 'org'));
ALTER TABLE challenges ADD CONSTRAINT challenges_goal_type_check CHECK (goal_type IN ('social_value', 'hours'));
ALTER TABLE challenges ADD CONSTRAINT challenges_dates_check CHECK (end_date > start_date);

CREATE TABLE IF NOT EXISTS challenge_participants (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenge_participants_user_idx ON challenge_participants(user_id);
