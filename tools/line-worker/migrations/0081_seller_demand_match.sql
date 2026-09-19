-- 2026-09-19 大隆さん指示「HOSHILU Seller収益化・需要マッチ改修」§2〜§4・§14
-- Demand Match Click: 探し中需要に Seller が商品を登録 → HOSHILU が再照合・通知 → ユーザーが通知から
-- 商品ページを実際に開いた時だけ 1有効クリック 50円。通常の商品クリックには課金しない。
CREATE TABLE IF NOT EXISTS seller_demand_match_clicks (
  click_id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE,          -- dm:<demand_id>:<asin>:<JST日付>（同一需要×商品は1日1回）
  seller_key TEXT NOT NULL,
  demand_id TEXT NOT NULL,
  demand_key TEXT NOT NULL DEFAULT '',
  asin TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL DEFAULT '',
  member_hash TEXT NOT NULL DEFAULT '',          -- 会員IDの片方向ハッシュ（個人は特定しない）
  notification_id TEXT NOT NULL DEFAULT '',
  amount_jpy INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL CHECK(status IN ('VALID','EXCLUDED')),
  reason TEXT NOT NULL DEFAULT '',               -- EXCLUDED の固定理由（BOT / SELF / QA / DUPLICATE / BUDGET_CAP / ...）
  settled TEXT NOT NULL DEFAULT 'PENDING' CHECK(settled IN ('PENDING','WALLET','INVOICE')),
  jst_month TEXT NOT NULL,                       -- YYYY-MM（JST）
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_demand_match_clicks_seller_month
  ON seller_demand_match_clicks(seller_key, jst_month, status);

-- Seller ごとの Demand Match 月額予算（上限）。初期値は安全側（3,000円）。
CREATE TABLE IF NOT EXISTS seller_demand_match_budgets (
  seller_key TEXT PRIMARY KEY,
  monthly_cap_jpy INTEGER NOT NULL DEFAULT 3000 CHECK(monthly_cap_jpy>=0),
  updated_at TEXT NOT NULL
);
