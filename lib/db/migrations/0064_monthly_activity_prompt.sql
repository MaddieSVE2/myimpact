-- The monthly "anything to add?" email (artifacts/api-server/src/jobs/
-- monthlyActivityPrompt.ts): whether a member still wants it (on until they
-- opt out, in Settings or by the link in each email), and when it last went
-- to them, so nobody is emailed twice in a month.
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "email_activity_prompt_opt_in" boolean DEFAULT true NOT NULL;
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "last_activity_prompt_sent_at" timestamp;
