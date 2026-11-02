-- A user's own AI provider. The key is AES-GCM encrypted and never returned to any client, admins included.
CREATE TABLE user_ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  key_enc TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  thinking_off INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
