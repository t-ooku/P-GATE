ALTER TABLE marketplace_sale_events ADD COLUMN info_type TEXT NOT NULL DEFAULT 'SALE';

ALTER TABLE member_sale_preferences ADD COLUMN info_types TEXT NOT NULL DEFAULT 'SALE';
ALTER TABLE member_sale_preferences ADD COLUMN frequency TEXT NOT NULL DEFAULT 'INSTANT';
ALTER TABLE member_sale_preferences ADD COLUMN quiet_start TEXT NOT NULL DEFAULT '21:00';
ALTER TABLE member_sale_preferences ADD COLUMN quiet_end TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE member_sale_preferences ADD COLUMN language TEXT NOT NULL DEFAULT 'JA';

CREATE INDEX IF NOT EXISTS marketplace_info_public
  ON marketplace_sale_events(status, info_type, starts_at, ends_at);

