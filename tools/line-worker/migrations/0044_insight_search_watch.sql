-- HOSHILU INSIGHT 通知仕様変更指示書 v1.0 (HOSHILU INSIGHT 検索条件監視 SSoT v1.0)
--
-- 保存した検索条件(HOSHILU INSIGHT)と、個別商品の価格・在庫・クーポン監視
-- (AIウォッチ、mywatch-policy.mjs/mywatch-routes.mjs)を責務分離する。
--
-- section15 (既存データの安全性)を満たすための設計:
--   - member_wishes の既存列 (watch_sale/watch_price/watch_coupon/watch_restock/
--     watch_frequency) は一切変更・削除・再解釈しない。これらは引き続き
--     AIウォッチ(商品単位の値下げ/クーポン/再入荷/セール開始監視)が読み書き
--     する列であり、今回のマイグレーションでは無傷のまま残す。
--   - notify_new_match は HOSHILU INSIGHT 専用の新しい列。デフォルト1。
--     このリポジトリには元々どのwatch_*フラグに対しても自動検出処理が
--     存在しない(0036マイグレーションのコメント参照: 「実際の価格監視
--     イベント検出(将来のバックエンド連携)はローンチ後の対応」)ため、
--     既存行のnotify_new_matchを1にしても新たに何かが誤発火することはなく、
--     実害なく移行できる。
--   - condition_snapshot は section6 が要求する保存条件の最低限フィールド
--     (元の検索文/正規化した検索文/AIが理解した検索意図/カテゴリ/主要属性/
--     価格条件/モール条件)をJSONとして保持する拡張可能な列。将来の条件
--     チップUI(今回は実装しない、section6/20)のためのデータ構造だけを
--     用意する。既存行はNULLのままで良い(新規保存/更新時に埋まる)。

ALTER TABLE member_wishes ADD COLUMN notify_new_match INTEGER NOT NULL DEFAULT 1;
ALTER TABLE member_wishes ADD COLUMN condition_snapshot TEXT;

-- search_watch_matches: 保存した検索条件(search_watch_id)ごとに、既に
-- 「新着」として通知した商品を記録する重複防止台帳(section4)。
--
-- search_watch_id という新しい採番の仕組みを別途持たず、
-- member_wishes.wish_id をそのままsearch_watch_idとして流用する
-- (1保存条件 = 1 wish_id なので、テーブル増殖を避けるため既存構造を
-- 最大限再利用する。section14の「新しいテーブルを増やす前に既存構造を
-- 確認する」要件に対応)。
--
-- UNIQUE(wish_id, product_identity_key) により、同じ商品は同じ条件に対して
-- 二度と「新着」として通知されない(section3/4/17: 単なるタイトルの微妙な
-- 変化では再通知しない。識別子はASIN/商品IDベースであり、タイトル文字列に
-- 依存しない)。
CREATE TABLE IF NOT EXISTS search_watch_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  wish_id TEXT NOT NULL,
  product_identity_key TEXT NOT NULL,
  asin TEXT,
  marketplace TEXT,
  matched_at TEXT NOT NULL,
  notification_id TEXT,
  UNIQUE(wish_id, product_identity_key)
);

CREATE INDEX IF NOT EXISTS search_watch_matches_by_member
  ON search_watch_matches (member_id, matched_at);
