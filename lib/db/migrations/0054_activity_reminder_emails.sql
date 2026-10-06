ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "email_reminders_opt_in" boolean DEFAULT true NOT NULL;
ALTER TABLE "recurring_templates"
ADD COLUMN IF NOT EXISTS "last_reminded_occurrence" timestamp;
