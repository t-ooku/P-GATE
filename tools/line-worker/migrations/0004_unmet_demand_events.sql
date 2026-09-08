CREATE TABLE IF NOT EXISTS unmet_demand_events (
  event_id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  demand_hash TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'unclassified',
  marketplace TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  contract_match INTEGER NOT NULL DEFAULT 0,
  demand_status TEXT NOT NULL DEFAULT 'UNMET',
  channel TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS unmet_demand_category_time
  ON unmet_demand_events (category, occurred_at DESC);

CREATE INDEX IF NOT EXISTS unmet_demand_hash_time
  ON unmet_demand_events (demand_hash, occurred_at DESC);
