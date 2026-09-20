-- Retained only for migration-number continuity.
-- Do not store search text, per-search identifiers, or row-level search telemetry.
CREATE TABLE IF NOT EXISTS google_mall_search_log (
  bucket_at TEXT NOT NULL,
  source TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(bucket_at, source, reason)
);
