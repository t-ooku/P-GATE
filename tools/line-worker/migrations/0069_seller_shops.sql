-- 2026-09-04 総合実行指示書 §24–29 ¥9,800 Seller: 公開ショップページ・クーポン・フォロー（ショップをホシる）
-- ショップは Business プランの事業者アカウント（seller_key）に1つ。公開URLは /shop/<slug>。
-- 商品は既存の products / sp_api_listings（tenant）から出すので、商品を二重管理しない。
CREATE TABLE IF NOT EXISTS seller_shops (
  seller_key TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  shop_name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  tenants TEXT NOT NULL DEFAULT '[]',
  seller_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','HIDDEN')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_shops_status ON seller_shops(status, updated_at);

-- セラーが設定するクーポン。HOSHILU 限定（hoshilu_only=1）は検索結果に 🎟 を出す。
CREATE TABLE IF NOT EXISTS seller_shop_coupons (
  coupon_id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  discount_text TEXT NOT NULL DEFAULT '',
  marketplace TEXT NOT NULL DEFAULT '',
  landing_url TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT '',
  hoshilu_only INTEGER NOT NULL DEFAULT 1 CHECK(hoshilu_only IN (0,1)),
  starts_at TEXT NOT NULL DEFAULT '',
  ends_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ENDED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_shop_coupons_seller ON seller_shop_coupons(seller_key, status, ends_at);

-- 会員のフォロー（ショップをホシる）。会員IDは member_wishes と同じ member_id。
CREATE TABLE IF NOT EXISTS member_shop_follows (
  member_id TEXT NOT NULL,
  seller_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, seller_key)
);
CREATE INDEX IF NOT EXISTS idx_member_shop_follows_shop ON member_shop_follows(seller_key, created_at);
