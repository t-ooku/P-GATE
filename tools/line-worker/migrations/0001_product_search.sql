PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  tenant TEXT NOT NULL,
  record_key TEXT NOT NULL,
  asin TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  manufacturer TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  amazon_jp_url TEXT NOT NULL DEFAULT '',
  amazon_us_url TEXT NOT NULL DEFAULT '',
  search_aliases TEXT NOT NULL DEFAULT '',
  localized_content TEXT NOT NULL DEFAULT '{}',
  row_hash TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (tenant, record_key)
);

CREATE INDEX IF NOT EXISTS products_tenant_asin ON products (tenant, asin);
CREATE INDEX IF NOT EXISTS products_tenant_hash ON products (tenant, row_hash);
CREATE INDEX IF NOT EXISTS products_tenant_stock ON products (tenant, stock);

CREATE VIRTUAL TABLE IF NOT EXISTS product_search USING fts5(
  tenant UNINDEXED,
  record_key UNINDEXED,
  product_name,
  manufacturer,
  search_aliases,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO product_search(rowid, tenant, record_key, product_name, manufacturer, search_aliases)
  VALUES (new.rowid, new.tenant, new.record_key, new.product_name, new.manufacturer, new.search_aliases);
END;

CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  DELETE FROM product_search WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  DELETE FROM product_search WHERE rowid = old.rowid;
  INSERT INTO product_search(rowid, tenant, record_key, product_name, manufacturer, search_aliases)
  VALUES (new.rowid, new.tenant, new.record_key, new.product_name, new.manufacturer, new.search_aliases);
END;

CREATE TABLE IF NOT EXISTS product_sync_batches (
  batch_id TEXT PRIMARY KEY,
  tenant TEXT NOT NULL,
  received_count INTEGER NOT NULL,
  changed_count INTEGER NOT NULL,
  received_at TEXT NOT NULL
);
