-- Hard application-side fuse for optional Cloud Vision WEB_DETECTION calls.
-- Reservations are made atomically before provider requests and are never
-- released on failure, so retries cannot bypass the monthly cap.
CREATE TABLE IF NOT EXISTS google_visual_web_detection_usage_monthly (
  usage_month TEXT PRIMARY KEY,
  reserved_requests INTEGER NOT NULL DEFAULT 0 CHECK (reserved_requests >= 0),
  monthly_limit INTEGER NOT NULL CHECK (monthly_limit > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
