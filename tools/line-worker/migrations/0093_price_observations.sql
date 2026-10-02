-- 2026-10-02 大隆さん指示書「HOSHILUを『今ほしい人が買うためのサービス』へ再設計する」§4④・§5
--
-- 価格推移のための「追記型」の価格記録。これまでの価格テーブルはどれも最新値を上書きする型で、
-- 過去の価格が1件も残っていなかった（marketplace_price_cache は1日で失効、target_price_observations は
-- wish 単位で商品が特定できない）。この表の最初の行の日付が「HOSHILUでの価格記録開始日」になる。
--
-- 守ること（§5）:
-- - 1商品×1販売先×1日 = 1行（observation_key）。同じ日に複数回見たら、その日の最安値を残す。
-- - 商品同一性は API の商品ID（楽天 itemCode・Yahoo! 商品コード）と JAN で持つ。タイトル一致で混ぜない。
-- - HOSHILU が API で確認した価格だけ。取っていない期間は埋めない。AI の推測を入れない。
-- - 検索本文・検索単位ID・会員IDは入れない（商品の公開情報だけ）。
-- - Amazon は過去価格の表示条件を確認するまで記録しない（CHECK で楽天・Yahoo! に限定）。
CREATE TABLE IF NOT EXISTS price_observations (
  observation_key TEXT PRIMARY KEY,
  record_key TEXT NOT NULL,
  jan TEXT NOT NULL DEFAULT '',
  marketplace TEXT NOT NULL CHECK(marketplace IN ('RAKUTEN_JP','YAHOO_JP')),
  external_product_id TEXT NOT NULL,
  seller_id TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK(price > 0),
  shipping INTEGER CHECK(shipping IS NULL OR shipping >= 0),
  total INTEGER CHECK(total IS NULL OR total >= price),
  stock_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  source TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_observations_record_date ON price_observations(record_key, observed_date);
CREATE INDEX IF NOT EXISTS idx_price_observations_jan_date ON price_observations(jan, observed_date);
CREATE INDEX IF NOT EXISTS idx_price_observations_date ON price_observations(observed_date);
