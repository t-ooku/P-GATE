-- ランキング検索 Phase 1。コード側Registryを初期値の権威とし、将来の
-- 管理画面・モール追加時にD1へ移行できる同型テーブルと、API呼び出しを
-- marketplace/category/ranking_type単位で抑制するキャッシュを用意する。
CREATE TABLE IF NOT EXISTS marketplace_capabilities (
  marketplace_id TEXT PRIMARY KEY,
  search_mode TEXT NOT NULL,
  ranking_mode TEXT NOT NULL CHECK (ranking_mode IN ('native_api','derived_api','direct_link')),
  review_mode TEXT NOT NULL CHECK (review_mode IN ('full_api','summary_api','direct_link','none')),
  ranking_url_template TEXT,
  search_url_template TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_ranking_cache (
  marketplace_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  ranking_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (marketplace_id, category_id, ranking_type)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_ranking_cache_expiry
  ON marketplace_ranking_cache(expires_at);
