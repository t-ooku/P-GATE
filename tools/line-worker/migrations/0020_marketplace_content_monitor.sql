CREATE TABLE IF NOT EXISTS marketplace_content_run_audit (
  run_id TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_active_events INTEGER NOT NULL DEFAULT 0,
  covered_marketplaces INTEGER NOT NULL DEFAULT 0,
  queued_notifications INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_marketplace_content_audit_time
ON marketplace_content_run_audit(checked_at DESC);
