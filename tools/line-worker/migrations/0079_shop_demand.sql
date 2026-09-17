-- 2026-09-17 大隆さん「HOSHILU SHOP全面強化」指示書 P0:
-- 全ショップ横断検索で見つからなかった「欲しい」を『探し中需要』として預かり、
-- Seller Dashboard に匿名集計で返し、商品が追加されたら再判定して本人に知らせる。
-- 個人を特定する情報は持たない（member_id は本人通知のためだけ。visitor_hash は日替わりの匿名ハッシュ）。

CREATE TABLE IF NOT EXISTS shop_demand_requests (
  demand_id TEXT PRIMARY KEY,
  demand_key TEXT NOT NULL,
  query_text TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  member_id TEXT NOT NULL DEFAULT '',
  visitor_hash TEXT NOT NULL DEFAULT '',
  seller_key TEXT NOT NULL DEFAULT '',
  result_state TEXT NOT NULL DEFAULT 'NONE',
  status TEXT NOT NULL DEFAULT 'OPEN',
  last_checked_at TEXT NOT NULL DEFAULT '',
  matched_at TEXT NOT NULL DEFAULT '',
  matched_seller_key TEXT NOT NULL DEFAULT '',
  matched_shop_slug TEXT NOT NULL DEFAULT '',
  matched_product_url TEXT NOT NULL DEFAULT '',
  matched_level TEXT NOT NULL DEFAULT '',
  notification_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_demand_requests_key ON shop_demand_requests(demand_key, status);
CREATE INDEX IF NOT EXISTS idx_shop_demand_requests_member ON shop_demand_requests(member_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_demand_requests_open ON shop_demand_requests(status, last_checked_at);

-- 横断検索の匿名ログ（検索回数・0件・近似のみ を Seller に返すため。検索文と結果の区分だけ）
CREATE TABLE IF NOT EXISTS shop_search_log (
  log_id TEXT PRIMARY KEY,
  demand_key TEXT NOT NULL,
  query_text TEXT NOT NULL,
  result_state TEXT NOT NULL,
  exact_count INTEGER NOT NULL DEFAULT 0,
  near_count INTEGER NOT NULL DEFAULT 0,
  visitor_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_search_log_key ON shop_search_log(demand_key, created_at);

-- Seller が「この需要に商品を登録」で紐付けた商品。自己申告のままでは一致にせず、HOSHILU が条件を再判定した結果を judged_level に持つ。
CREATE TABLE IF NOT EXISTS shop_demand_offers (
  offer_id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  demand_key TEXT NOT NULL,
  asin TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  judged_level TEXT NOT NULL DEFAULT 'NONE',
  matched_json TEXT NOT NULL DEFAULT '[]',
  unmatched_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_demand_offers_key ON shop_demand_offers(demand_key, seller_key);
