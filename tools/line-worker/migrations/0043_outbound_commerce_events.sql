-- v4.3 指示書 section 27・28: ショップ・Seller送客計測基盤。
-- ユーザーが「Amazonで見る」「楽天市場で見る」「AI最安比較からショップへ
-- 移動」等を押した時の送客イベントを記録する。
--
-- 個人を直接特定する情報は保存しない(section 28): 検索文そのものは保存せず
-- (session_id/search_intent_idは既存のハッシュ化済みID・匿名クエリIDを
-- 再利用するのみ)。追加のみのマイグレーション。既存のunmet_demand_events /
-- kpi_events 等は変更しない(それぞれ別目的の既存テーブルとして無傷のまま)。

CREATE TABLE IF NOT EXISTS outbound_commerce_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  hoshilu_product_id TEXT,
  source_marketplace TEXT NOT NULL DEFAULT 'HOSHILU',
  destination_marketplace TEXT NOT NULL,
  seller_id TEXT,
  organic_or_sponsored TEXT NOT NULL DEFAULT 'ORGANIC',
  search_intent_id TEXT,
  session_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS outbound_commerce_events_by_destination
  ON outbound_commerce_events (destination_marketplace, occurred_at);

CREATE INDEX IF NOT EXISTS outbound_commerce_events_by_seller
  ON outbound_commerce_events (seller_id, occurred_at);
