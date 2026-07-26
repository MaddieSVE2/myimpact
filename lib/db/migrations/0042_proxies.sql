CREATE TABLE IF NOT EXISTS proxies (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL,
  unit TEXT NOT NULL,
  source_year TEXT NOT NULL DEFAULT '',
  horizon TEXT NOT NULL DEFAULT 'per_instance',
  deflation_factor REAL NOT NULL DEFAULT 1,
  allowed_units TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS proxies_title_idx ON proxies (title);
