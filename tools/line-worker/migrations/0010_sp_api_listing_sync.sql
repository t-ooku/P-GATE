CREATE TABLE IF NOT EXISTS sp_api_listings (
  tenant TEXT NOT NULL,
  seller_sku TEXT NOT NULL,
  marketplace_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  asin TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL DEFAULT '',
  condition_type TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  created_at_amazon TEXT NOT NULL DEFAULT '',
  updated_at_amazon TEXT NOT NULL DEFAULT '',
  buyable INTEGER NOT NULL DEFAULT 0,
  discoverable INTEGER NOT NULL DEFAULT 0,
  status_json TEXT NOT NULL DEFAULT '[]',
  quantity INTEGER,
  price REAL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  issues_json TEXT NOT NULL DEFAULT '[]',
  product_url TEXT NOT NULL DEFAULT '',
  sync_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  missing_from_amazon INTEGER NOT NULL DEFAULT 0,
  missing_scan_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'amazon_sp_api',
  PRIMARY KEY (tenant, seller_sku, marketplace_id)
);

CREATE INDEX IF NOT EXISTS sp_api_listing_asin
  ON sp_api_listings (tenant, asin);
CREATE INDEX IF NOT EXISTS sp_api_listing_active
  ON sp_api_listings (tenant, buyable, discoverable, missing_from_amazon);

CREATE TABLE IF NOT EXISTS sp_api_sync_cursors (
  tenant TEXT PRIMARY KEY,
  cursor_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sp_api_sync_audit (
  audit_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tenant TEXT NOT NULL,
  seller_id TEXT NOT NULL DEFAULT '',
  sync_id TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  items INTEGER NOT NULL DEFAULT 0,
  from_at TEXT NOT NULL DEFAULT '',
  to_at TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sp_api_audit_tenant_time
  ON sp_api_sync_audit (tenant, completed_at DESC);
