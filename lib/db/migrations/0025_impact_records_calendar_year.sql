-- Calendar-year activity logging model.
--
-- Adds the unified "entry date" that determines which calendar year and
-- month an impact record belongs to. Existing records are backfilled from
-- created_at so that nothing is lost.
--
-- Also adds habit_template_id so that bulk-created entries spawned from a
-- recurring habit template can be traced back to the template they came
-- from (used by the year-rollover prompt and overlap detection).

ALTER TABLE "impact_records"
  ADD COLUMN IF NOT EXISTS "entry_date" timestamp;

UPDATE "impact_records"
  SET "entry_date" = "created_at"
  WHERE "entry_date" IS NULL;

ALTER TABLE "impact_records"
  ALTER COLUMN "entry_date" SET NOT NULL,
  ALTER COLUMN "entry_date" SET DEFAULT now();

CREATE INDEX IF NOT EXISTS "impact_records_user_entry_date_idx"
  ON "impact_records" ("user_id", "entry_date");

ALTER TABLE "impact_records"
  ADD COLUMN IF NOT EXISTS "habit_template_id" integer;

CREATE INDEX IF NOT EXISTS "impact_records_user_habit_template_idx"
  ON "impact_records" ("user_id", "habit_template_id")
  WHERE "habit_template_id" IS NOT NULL;
