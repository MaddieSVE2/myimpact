CREATE TABLE IF NOT EXISTS analytics_daily_summary (
  id SERIAL PRIMARY KEY,
  day DATE NOT NULL,
  event_name TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'member',
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_daily_summary_day_event_surface_uq
  ON analytics_daily_summary (day, event_name, surface);

CREATE INDEX IF NOT EXISTS analytics_daily_summary_day_idx
  ON analytics_daily_summary (day);
