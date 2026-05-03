ALTER TABLE impact_records
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS impact_records_tags_idx ON impact_records USING GIN (tags);
CREATE INDEX IF NOT EXISTS journal_entries_tags_idx ON journal_entries USING GIN (tags);
