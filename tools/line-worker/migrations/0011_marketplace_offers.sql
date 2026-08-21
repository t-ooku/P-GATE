CREATE TABLE IF NOT EXISTS marketplace_offers (
  tenant TEXT NOT NULL,
  record_key TEXT NOT NULL DEFAULT '',
  asin TEXT NOT NULL DEFAULT '',
  marketplace TEXT NOT NULL,
  external_product_id TEXT NOT NULL,
  seller_id TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'JPY',
  stock_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'partner_feed',
  PRIMARY KEY(tenant,marketplace,external_product_id,seller_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_offers_asin ON marketplace_offers(tenant,asin,active);
CREATE INDEX IF NOT EXISTS idx_marketplace_offers_record ON marketplace_offers(tenant,record_key,active);
