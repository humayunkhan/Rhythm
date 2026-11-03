-- Each user's stock dilutions by note id; notes without an entry use Rhythm's defaults.
ALTER TABLE users ADD COLUMN dilutions TEXT NOT NULL DEFAULT '{}';
