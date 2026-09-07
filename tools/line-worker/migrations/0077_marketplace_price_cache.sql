-- 2026-09-07 user P0-3 authorization. API cache is separate from tenant offers.
-- Rakuten prices: official FAQ permits up to 24h. No raw payloads or history.
CREATE TABLE IF NOT EXISTS marketplace_price_cache (
  record_key TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL CHECK(marketplace='RAKUTEN_JP'),
  marketplace_product_id TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price>0),
  shipping INTEGER CHECK(shipping IS NULL OR shipping>=0),
  effective_price INTEGER CHECK(effective_price IS NULL OR effective_price>=price),
  currency TEXT NOT NULL CHECK(currency='JPY'),
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source='rakuten_ichiba_api'),
  CHECK(julianday(expires_at)>julianday(fetched_at) AND julianday(expires_at)-julianday(fetched_at)<=1)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_price_cache_expiry ON marketplace_price_cache(expires_at);
