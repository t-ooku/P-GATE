-- 2026-09-19 大隆さん決定: 楽天・Yahoo! 以外の 11 モールは公式 Google 検索（Custom Search JSON API）の
-- 結果をカードで出す。無料枠 100 クエリ/日を超えないよう、太平洋時間の日付ごとに予約数を数える。
CREATE TABLE IF NOT EXISTS google_mall_search_usage_daily (
  usage_day TEXT PRIMARY KEY,                 -- YYYY-MM-DD（America/Los_Angeles）
  reserved_requests INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 95,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
