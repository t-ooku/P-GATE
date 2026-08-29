-- Serialize cron/manual scans for the same saved condition.  This prevents
-- overlapping candidate sets (for example A,B and B,C) from generating two
-- notification bodies that both announce B.
CREATE TABLE IF NOT EXISTS insight_scan_leases (
  wish_id TEXT PRIMARY KEY,
  lease_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS insight_scan_leases_expiry
  ON insight_scan_leases (expires_at);
