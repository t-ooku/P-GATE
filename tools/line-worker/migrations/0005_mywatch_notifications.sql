ALTER TABLE member_wishes ADD COLUMN watch_frequency TEXT NOT NULL DEFAULT 'INSTANT';

CREATE TABLE IF NOT EXISTS mywatch_notifications (
  notification_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  wish_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WEB',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  delivered_at TEXT,
  read_at TEXT,
  dismissed_at TEXT,
  last_error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(member_id, wish_id, event_key, channel)
);

CREATE INDEX IF NOT EXISTS mywatch_delivery_queue
  ON mywatch_notifications(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS mywatch_member_created
  ON mywatch_notifications(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mywatch_delivery_audit (
  audit_id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  action TEXT NOT NULL,
  channel TEXT NOT NULL,
  result TEXT NOT NULL,
  error_code TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mywatch_audit_notification
  ON mywatch_delivery_audit(notification_id, occurred_at DESC);
