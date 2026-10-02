-- 2026-10-03 HOSHILU Seller「AI販促担当」(指示書 ai-promo-20261003-v2 §5)。追加のみ。既存行の UPDATE/DELETE なし。
-- 店プロファイル・店の商品（転記のみ）・お客様の疑問。すべて seller_key で店を分離する。
CREATE TABLE IF NOT EXISTS seller_promo_profiles (
  seller_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'LISTING' CHECK(plan IN ('LISTING','LIGHT','STANDARD')),
  categories TEXT NOT NULL DEFAULT '[]',
  ng_words TEXT NOT NULL DEFAULT '[]',
  brand TEXT NOT NULL DEFAULT '{}',
  publish_target TEXT NOT NULL DEFAULT 'NONE' CHECK(publish_target IN ('NONE','WORDPRESS','RAKUTEN_GOLD_DELIVERY')),
  approval_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK(approval_mode IN ('MANUAL','AUTO')),
  weekday INTEGER NOT NULL DEFAULT 1 CHECK(weekday BETWEEN 0 AND 6),
  hour_jst INTEGER NOT NULL DEFAULT 6 CHECK(hour_jst BETWEEN 0 AND 23),
  notify_email TEXT NOT NULL DEFAULT '',
  pilot_id TEXT NOT NULL DEFAULT '',
  qa INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','ENDED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seller_promo_products (
  id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('CSV','URL','SP_API')),
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_jpy INTEGER,
  url TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  attrs TEXT NOT NULL DEFAULT '{}',
  hash TEXT NOT NULL,
  last_featured_week TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(seller_key, source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_seller_promo_products_seller ON seller_promo_products(seller_key, active);

CREATE TABLE IF NOT EXISTS seller_promo_questions (
  id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('FEEDBACK_API','STORE_PASTE','HOSHILU_DEMAND','SUGGEST','FORM')),
  product_ref TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL CHECK(length(text) <= 300),
  text_hash TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  period_from TEXT NOT NULL DEFAULT '',
  period_to TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(seller_key, source, text_hash)
);
CREATE INDEX IF NOT EXISTS idx_seller_promo_questions_seller ON seller_promo_questions(seller_key, created_at);
