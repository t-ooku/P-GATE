-- 2026-09-07 大隆さんへの報告から: 希望価格ウォッチの巡回は動いていたが、
-- 「調べた」という印だけを残していて、いくらだったのか・そもそも商品を
-- 見つけられたのかが一切残っていなかった。そのため
--   「見つけて、まだ3,200円だった」
--   「そもそも同じ商品を見つけられなかった」
-- の区別がつかず、直しようがなかった。
--
-- ここには結果だけを残す。会員IDも検索文も入れない（誰のウォッチかは分からない）。
-- 90日で消す。
CREATE TABLE IF NOT EXISTS target_price_observations (
  observation_id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  matched INTEGER NOT NULL DEFAULT 0,
  price_jpy INTEGER,
  target_price_jpy INTEGER NOT NULL DEFAULT 0,
  marketplace TEXT NOT NULL DEFAULT '',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_target_price_obs_wish ON target_price_observations(wish_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_target_price_obs_at ON target_price_observations(observed_at);
