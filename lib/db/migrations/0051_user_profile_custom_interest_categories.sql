ALTER TABLE "user_profiles"
ADD COLUMN IF NOT EXISTS "custom_interest_categories" jsonb;