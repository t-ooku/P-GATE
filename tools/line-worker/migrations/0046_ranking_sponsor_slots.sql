-- HOSHILU総合人気ランキングの自然順位とは完全分離したスポンサー在庫。
-- 自然順位テーブル/スコアを更新する外部キーやboost列は意図的に持たない。
CREATE TABLE IF NOT EXISTS ranking_sponsor_campaigns (
  campaign_id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL,
  hoshilu_product_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  bid_jpy INTEGER NOT NULL CHECK (bid_jpy > 0),
  remaining_budget_jpy INTEGER NOT NULL CHECK (remaining_budget_jpy >= 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ranking_sponsor_category_active
  ON ranking_sponsor_campaigns(category_id, active, starts_at, ends_at);
