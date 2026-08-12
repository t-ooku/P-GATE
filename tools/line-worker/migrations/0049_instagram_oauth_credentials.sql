CREATE TABLE IF NOT EXISTS instagram_oauth_credentials (
  platform TEXT PRIMARY KEY CHECK (platform = 'INSTAGRAM'),
  account_id TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'bearer',
  scopes TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  last_refreshed_at TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_oauth_account
  ON instagram_oauth_credentials(account_id);

CREATE INDEX IF NOT EXISTS idx_instagram_oauth_expiry
  ON instagram_oauth_credentials(status, expires_at);
