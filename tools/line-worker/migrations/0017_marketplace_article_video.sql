ALTER TABLE marketplace_sale_events ADD COLUMN video_url TEXT NOT NULL DEFAULT '';
ALTER TABLE marketplace_sale_events ADD COLUMN video_rights_status TEXT NOT NULL DEFAULT 'NONE';
