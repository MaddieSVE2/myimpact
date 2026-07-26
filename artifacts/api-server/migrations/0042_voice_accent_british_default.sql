-- Make the British accent the site-wide default for Sidekick's spoken replies.
-- New users get 'british' via the column default; existing rows still on the
-- old 'neutral' default are moved over so the change applies to everyone.
ALTER TABLE users ALTER COLUMN voice_accent SET DEFAULT 'british';
UPDATE users SET voice_accent = 'british' WHERE voice_accent = 'neutral';
