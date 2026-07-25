-- Pre-mapped local charity suggestions per local authority × category.
CREATE TABLE IF NOT EXISTS "local_charity_areas" (
  "local_authority" text PRIMARY KEY,
  "country" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'pending',
  "last_generated_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "local_charity_suggestions" (
  "local_authority" text NOT NULL,
  "category" text NOT NULL,
  "places" jsonb NOT NULL,
  "generated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "local_charity_suggestions_local_authority_category_pk" PRIMARY KEY ("local_authority", "category")
);

CREATE INDEX IF NOT EXISTS "local_charity_suggestions_authority_idx"
  ON "local_charity_suggestions" ("local_authority");
