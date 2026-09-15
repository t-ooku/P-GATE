CREATE TABLE IF NOT EXISTS marketplace_sale_events (
  sale_id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  announced_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  image_rights_status TEXT NOT NULL DEFAULT 'NONE',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS marketplace_sales_public
  ON marketplace_sale_events(status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS member_sale_preferences (
  member_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  advance_notice INTEGER NOT NULL DEFAULT 1,
  marketplaces TEXT NOT NULL DEFAULT 'ALL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_sale_notifications (
  member_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  notice_type TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(member_id, sale_id, notice_type)
);

