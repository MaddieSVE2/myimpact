-- Adds a per-user preferred UI / email language. Defaults to 'en' so existing
-- users continue to receive English UI and emails until they opt in to Welsh.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'en';
