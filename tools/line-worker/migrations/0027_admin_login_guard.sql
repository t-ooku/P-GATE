CREATE TABLE IF NOT EXISTS admin_login_guard (
  fingerprint_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  locked_until TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_login_guard_locked
  ON admin_login_guard (locked_until, updated_at);

CREATE TABLE IF NOT EXISTS admin_auth_audit (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('LOGIN_SUCCESS','LOGIN_FAILURE','LOGIN_LOCKED','LOGOUT')),
  fingerprint_hash TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_auth_audit_time
  ON admin_auth_audit (occurred_at DESC);
