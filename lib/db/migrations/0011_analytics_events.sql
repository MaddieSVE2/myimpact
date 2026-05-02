-- Internal funnel analytics event log. Privacy-first: no PII beyond an
-- optional users.id foreign key. Each event has a name, an optional
-- props JSON blob, and a "surface" so member-side and org-side events
-- can be reported separately.
CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" SERIAL PRIMARY KEY,
  "event_name" TEXT NOT NULL,
  "user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "surface" TEXT NOT NULL DEFAULT 'member',
  "props" JSONB,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "analytics_events_event_name_idx" ON "analytics_events" ("event_name");
CREATE INDEX IF NOT EXISTS "analytics_events_user_id_idx" ON "analytics_events" ("user_id");
CREATE INDEX IF NOT EXISTS "analytics_events_created_at_idx" ON "analytics_events" ("created_at");
