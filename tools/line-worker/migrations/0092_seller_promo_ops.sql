-- 2026-10-03 HOSHILU Seller「AI販促担当」接続（AES-GCM 暗号化）・原価・監査。追加のみ。
CREATE TABLE IF NOT EXISTS seller_promo_connections (
  id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('WORDPRESS')),
  site_url TEXT NOT NULL,
  username TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED','ERROR')),
  last_ok_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(seller_key, kind)
);

CREATE TABLE IF NOT EXISTS seller_promo_usage (
  id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  job_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  images INTEGER NOT NULL DEFAULT 0,
  cost_jpy_est REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_promo_usage_seller ON seller_promo_usage(seller_key, created_at);
CREATE INDEX IF NOT EXISTS idx_seller_promo_usage_time ON seller_promo_usage(created_at);

CREATE TABLE IF NOT EXISTS seller_promo_audit (
  id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('SYSTEM','SELLER','ADMIN')),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_promo_audit_seller ON seller_promo_audit(seller_key, created_at);
