ALTER TABLE member_wishes ADD COLUMN watch_sale INTEGER NOT NULL DEFAULT 1;
ALTER TABLE member_wishes ADD COLUMN watch_price INTEGER NOT NULL DEFAULT 1;
ALTER TABLE member_wishes ADD COLUMN watch_coupon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE member_wishes ADD COLUMN watch_restock INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS member_wish_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'JA',
  watch_sale INTEGER NOT NULL DEFAULT 0,
  watch_price INTEGER NOT NULL DEFAULT 0,
  watch_coupon INTEGER NOT NULL DEFAULT 0,
  watch_restock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_wish_events_type_created
  ON member_wish_events (event_type, created_at DESC);
