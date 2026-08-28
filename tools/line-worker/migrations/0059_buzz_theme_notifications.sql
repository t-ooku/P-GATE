CREATE TABLE IF NOT EXISTS member_buzz_preferences (
  member_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  delivery_channels TEXT NOT NULL DEFAULT 'APP',
  language TEXT NOT NULL DEFAULT 'JA',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS member_buzz_preferences_enabled
  ON member_buzz_preferences(enabled, updated_at);
