-- 2026-10-17 大隆さん「スレッズはどうすればいいの？」→「おけ、続けて」:
-- Threads の長期アクセストークン（60 日）が 10/16 に切れて投稿が止まった（THREADS_CREATE_401）。
-- 大隆さんが入れ直した Worker secret（THREADS_ACCESS_TOKEN）を種にして、Worker が数日ごとに
-- refresh_access_token で延長し、延長後のトークンを暗号化して保存する（Instagram と同じ SOCIAL_OAUTH_ENCRYPTION_KEY）。
-- 新しい表だけ。既存の行・表は変えない。トークンそのものは平文で残さない。
CREATE TABLE IF NOT EXISTS threads_token_store (
  platform TEXT PRIMARY KEY CHECK (platform = 'THREADS'),
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  seed_fingerprint TEXT NOT NULL,
  expires_at TEXT NOT NULL DEFAULT '',
  last_refreshed_at TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
