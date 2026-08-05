-- HOSHILU GAS→Web移行: gas/MultilingualSeoEngine.gs のSearch_Alias /
-- Localized_Contentシートに相当するD1索引。承認(Approved)フラグを含む全行を
-- push対象とし(ON CONFLICT DO UPDATEで非承認への変更も反映できるようにする)、
-- Worker側の読み出しはapproved=1のみをフィルタする(gas側のloadApprovedAliases/
-- loadApprovedContentと同じ条件)。Sheetsが承認UIの正本のまま
-- (docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3/§4.6)。

CREATE TABLE IF NOT EXISTS product_aliases (
  tenant TEXT NOT NULL,
  asin TEXT NOT NULL,
  language TEXT NOT NULL,
  alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant, asin, language, alias)
);

CREATE INDEX IF NOT EXISTS product_aliases_lookup
  ON product_aliases (tenant, asin, approved);

CREATE TABLE IF NOT EXISTS localized_product_content (
  tenant TEXT NOT NULL,
  asin TEXT NOT NULL,
  language TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant, asin, language)
);

CREATE INDEX IF NOT EXISTS localized_product_content_lookup
  ON localized_product_content (tenant, asin, language, approved);

CREATE TABLE IF NOT EXISTS multilingual_sync_batches (
  batch_id TEXT PRIMARY KEY,
  received_aliases INTEGER NOT NULL DEFAULT 0,
  received_content INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL
);
