-- Email opt-in flag controls both the onboarding sequence and the future
-- monthly digest. Defaulting to true means existing users keep receiving
-- updates unless they explicitly opt out.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_opt_in boolean NOT NULL DEFAULT true;

-- Tracks which onboarding email steps have been delivered to which users.
-- The unique index on (user_id, step) is what makes the daily dispatcher
-- idempotent: re-running a day's batch can never double-send the same
-- email to the same user.
CREATE TABLE IF NOT EXISTS onboarding_email_sends (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step integer NOT NULL,
  sent_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_email_sends_user_step_uniq
  ON onboarding_email_sends (user_id, step);
