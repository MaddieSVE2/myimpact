-- Community thumbs-up votes on pre-mapped local charity suggestions.
-- One vote per user per charity per local authority; charity_key is
-- "reg:<registration number>" (preferred) or "name:<normalised name>" so
-- votes survive the ~monthly suggestion regeneration.
CREATE TABLE IF NOT EXISTS "local_charity_votes" (
  "local_authority" text NOT NULL,
  "charity_key" text NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "local_charity_votes_local_authority_charity_key_user_id_pk"
    PRIMARY KEY ("local_authority", "charity_key", "user_id")
);

CREATE INDEX IF NOT EXISTS "local_charity_votes_authority_idx"
  ON "local_charity_votes" ("local_authority");
