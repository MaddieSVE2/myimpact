CREATE TABLE IF NOT EXISTS "sidekick_template_overrides" (
  "template_id" text PRIMARY KEY,
  "label" text,
  "description" text,
  "persona_prompts" jsonb,
  "updated_by" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
