ALTER TABLE marketplace_offers ADD COLUMN data_rights_status TEXT NOT NULL DEFAULT 'UNSPECIFIED';
ALTER TABLE marketplace_offers ADD COLUMN rights_reference TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_marketplace_offers_rights
ON marketplace_offers(marketplace,data_rights_status,active);
