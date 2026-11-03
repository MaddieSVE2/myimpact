-- Finding what was submitted to an organisation scanned every record. Most
-- records aren't submitted anywhere, so a partial index stays small.
CREATE INDEX IF NOT EXISTS "impact_records_submitted_to_org_idx"
  ON "impact_records" ("submitted_to_org_id")
  WHERE "submitted_to_org_id" IS NOT NULL;
