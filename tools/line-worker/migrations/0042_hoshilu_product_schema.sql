-- v4.3 指示書 section 21・22: HOSHILU共通商品データ形式 + canonical product。
-- AI最安比較・AIウォッチ・優先出品・スポンサー・Search API・Seller分析が
-- 将来すべて共有して使う正規化済み商品データの土台。
--
-- hoshilu_products: 複数モールの同一商品を束ねる「canonical product」。
-- hoshilu_product_offers: モールごとの個別オファー。正規化パイプライン
-- (normalizer)の出力先であり、Amazon形式・楽天形式・Seller CSV等の生データを
-- そのままUIへ流さないための唯一の中間形式(v4.3 section 23)。
--
-- 追加のみのマイグレーション。既存テーブル(marketplace_offers等)は変更しない
-- - 「解決済み項目を再改修しない」の原則どおり、既存の送客・在庫連携は無傷。

CREATE TABLE IF NOT EXISTS hoshilu_products (
  hoshilu_product_id TEXT PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT '',
  normalized_title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  representative_image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hoshilu_product_offers (
  hoshilu_product_id TEXT NOT NULL,
  source_marketplace TEXT NOT NULL,
  source_product_id TEXT NOT NULL,
  asin TEXT,
  jan TEXT,
  gtin TEXT,
  manufacturer_part_number TEXT,
  brand TEXT,
  title TEXT NOT NULL DEFAULT '',
  normalized_title TEXT NOT NULL DEFAULT '',
  category TEXT,
  attributes TEXT,
  image_url TEXT,
  product_url TEXT NOT NULL DEFAULT '',
  price REAL,
  shipping_fee REAL,
  effective_price REAL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  stock_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  seller_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_marketplace, source_product_id)
);

CREATE INDEX IF NOT EXISTS hoshilu_product_offers_by_product
  ON hoshilu_product_offers (hoshilu_product_id);

CREATE INDEX IF NOT EXISTS hoshilu_product_offers_by_identifier
  ON hoshilu_product_offers (jan, gtin);
