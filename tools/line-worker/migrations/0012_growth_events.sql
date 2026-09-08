CREATE TABLE IF NOT EXISTS growth_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  locale TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  marketplace TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS growth_events_type_time
  ON growth_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS growth_events_campaign_time
  ON growth_events (campaign, occurred_at DESC);
