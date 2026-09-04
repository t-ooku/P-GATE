CREATE TABLE IF NOT EXISTS member_wishes (
  member_id TEXT NOT NULL,
  wish_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'JA',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, wish_id)
);
CREATE INDEX IF NOT EXISTS member_wishes_member_updated ON member_wishes (member_id, updated_at DESC);
