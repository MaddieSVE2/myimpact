-- Community corrections for local charity suggestions: an overrides layer
-- merged over stored suggestions at read time, plus a log of user submissions.

CREATE TABLE IF NOT EXISTS "local_charity_overrides" (
  "id" text PRIMARY KEY,
  "local_authority" text NOT NULL,
  "category" text,
  "target_name" text,
  "kind" text NOT NULL,
  "patch" jsonb,
  "place" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "local_charity_overrides_authority_idx"
  ON "local_charity_overrides" ("local_authority");

CREATE TABLE IF NOT EXISTS "local_charity_submissions" (
  "id" text PRIMARY KEY,
  "user_id" text,
  "type" text NOT NULL,
  "local_authority" text NOT NULL,
  "country" text NOT NULL DEFAULT '',
  "category" text,
  "charity_name" text NOT NULL,
  "issue_type" text,
  "submitted_website" text,
  "note" text,
  "status" text NOT NULL,
  "verification_detail" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "local_charity_submissions_user_idx"
  ON "local_charity_submissions" ("user_id");

-- Known data fix: Fife Voluntary Action's website was wrong in the AI-generated
-- Fife suggestions. Apply the correct URL as a persistent override.
INSERT INTO "local_charity_overrides"
  ("id", "local_authority", "category", "target_name", "kind", "patch")
SELECT gen_random_uuid()::text, 'Fife', NULL, 'Fife Voluntary Action', 'patch',
       '{"website": "https://www.fva.org"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM "local_charity_overrides"
  WHERE "local_authority" = 'Fife' AND "target_name" = 'Fife Voluntary Action' AND "kind" = 'patch'
);
