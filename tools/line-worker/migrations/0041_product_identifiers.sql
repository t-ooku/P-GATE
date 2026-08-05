-- HOSHILU GAS→Web移行: gas/ProductIdentifierEngine.gs のProduct_Identifiers
-- シートに相当するD1索引(JAN/EAN/UPC↔ASIN)。承認フラグを含む全行をpush対象
-- とし、Worker側の読み出しはapproved=1のみをフィルタする(他のD1移植と同じ
-- パターン)。Identifier_Coverage/Identifier_Conflictsは社内運用レポート
-- (Sheets上でのみ閲覧される)のため、今回はWeb側の実利用箇所が無く対象外
-- (docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3)。

CREATE TABLE IF NOT EXISTS product_identifiers (
  tenant TEXT NOT NULL,
  asin TEXT NOT NULL,
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant, asin, identifier_type, identifier_value)
);

CREATE INDEX IF NOT EXISTS product_identifiers_lookup
  ON product_identifiers (tenant, identifier_value, approved);

CREATE TABLE IF NOT EXISTS product_identifier_sync_batches (
  batch_id TEXT PRIMARY KEY,
  received_count INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL
);
