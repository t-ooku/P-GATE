-- 2026-09-20 大隆さん報告「韓国 頭皮ケア リリーブ で Google 枠が出ない」: 何が返って何で落ちたかを本番で追えるように、
-- 1 検索 1 行の結果ログを残す（検索語は 120 字まで。個人情報は redact 済みの検索語だけ。14 日で消す）。
CREATE TABLE IF NOT EXISTS google_mall_search_log (
  log_id TEXT PRIMARY KEY,
  searched_at TEXT NOT NULL,
  query_text TEXT NOT NULL,
  source TEXT NOT NULL,            -- cache | live | disabled | limit | error
  reason TEXT NOT NULL DEFAULT '',
  raw_count INTEGER NOT NULL DEFAULT 0,      -- Google が返した件数
  product_count INTEGER NOT NULL DEFAULT 0,  -- 11 モールの商品ページとして残った件数
  kept_count INTEGER NOT NULL DEFAULT 0,     -- 除外モールを外して画面に出した件数
  excluded_marketplaces TEXT NOT NULL DEFAULT '',
  latency_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_google_mall_search_log_searched_at ON google_mall_search_log(searched_at);
