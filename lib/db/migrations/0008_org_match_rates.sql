CREATE TABLE IF NOT EXISTS "org_match_rates" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "hourly_rate" numeric(10, 4),
  "donation_multiplier" numeric(10, 4),
  "monthly_cap_per_member" numeric(12, 2),
  "only_verified_hours" boolean NOT NULL DEFAULT false,
  "effective_from" timestamp NOT NULL,
  "effective_to" timestamp,
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "org_match_rates_org_id_idx" ON "org_match_rates" ("org_id");
CREATE INDEX IF NOT EXISTS "org_match_rates_effective_idx" ON "org_match_rates" ("org_id", "effective_from");
