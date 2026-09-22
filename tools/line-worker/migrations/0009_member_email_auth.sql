CREATE TABLE IF NOT EXISTS member_email_challenges (
  email_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_email_challenges_expiry ON member_email_challenges(expires_at);
