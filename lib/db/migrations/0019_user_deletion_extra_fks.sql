-- Round-2 GDPR fix-up: relax the remaining user-referencing FKs that
-- would otherwise block right-to-erasure when the user is an org actor.
-- Pulse-survey artefacts (responses & opt-outs) are personal data and get
-- explicitly deleted by the application; the "created_by" actor on
-- org-owned aggregate rows is preserved-with-NULL so the org's history
-- isn't lost.

-- org_surveys.created_by — keep the survey, forget the actor.
ALTER TABLE org_surveys ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE org_surveys DROP CONSTRAINT IF EXISTS org_surveys_created_by_fkey;
ALTER TABLE org_surveys
  ADD CONSTRAINT org_surveys_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- org_survey_responses.user_id — personal answer, cascade with the user.
ALTER TABLE org_survey_responses DROP CONSTRAINT IF EXISTS org_survey_responses_user_id_fkey;
ALTER TABLE org_survey_responses
  ADD CONSTRAINT org_survey_responses_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- org_survey_opt_outs.user_id — preference belongs to the user, cascade.
ALTER TABLE org_survey_opt_outs DROP CONSTRAINT IF EXISTS org_survey_opt_outs_user_id_fkey;
ALTER TABLE org_survey_opt_outs
  ADD CONSTRAINT org_survey_opt_outs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- org_api_keys.created_by — keep the key (revoke separately), forget actor.
ALTER TABLE org_api_keys ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE org_api_keys DROP CONSTRAINT IF EXISTS org_api_keys_created_by_fkey;
ALTER TABLE org_api_keys
  ADD CONSTRAINT org_api_keys_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- org_webhooks.created_by — same: keep the webhook, forget the actor.
ALTER TABLE org_webhooks ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE org_webhooks DROP CONSTRAINT IF EXISTS org_webhooks_created_by_fkey;
ALTER TABLE org_webhooks
  ADD CONSTRAINT org_webhooks_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
