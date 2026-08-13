CREATE TABLE IF NOT EXISTS runway_budget_policy (
  policy_id INTEGER PRIMARY KEY,
  initial_cap_credits INTEGER NOT NULL DEFAULT 1000 CHECK (initial_cap_credits > 0),
  monthly_cap_credits INTEGER NOT NULL DEFAULT 3000 CHECK (monthly_cap_credits > 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  kill_switch INTEGER NOT NULL DEFAULT 0 CHECK (kill_switch IN (0,1)),
  initial_test_completed INTEGER NOT NULL DEFAULT 0 CHECK (initial_test_completed IN (0,1)),
  initial_started_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO runway_budget_policy(policy_id,initial_cap_credits,monthly_cap_credits,enabled,kill_switch,initial_started_at,created_at,updated_at)
VALUES (1,1000,3000,1,0,'2026-08-13T00:00:00.000Z','2026-08-13T00:00:00.000Z','2026-08-13T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS runway_budget_periods (
  period_key TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN ('TEST','MONTH')),
  cap_credits INTEGER NOT NULL CHECK(cap_credits > 0), reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK(reserved_credits >= 0), settled_credits INTEGER NOT NULL DEFAULT 0 CHECK(settled_credits >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runway_generation_jobs (
  job_id TEXT PRIMARY KEY, post_id TEXT, request_fingerprint TEXT NOT NULL UNIQUE, provider_task_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','APPROVED','BUDGET_RESERVED','SUBMITTING','PROCESSING','GENERATED_REVIEW_REQUIRED','APPROVED_FOR_POST','PUBLISHED','FAILED_RETRYABLE','FAILED_FINAL','BUDGET_BLOCKED','AMBIGUOUS_SUBMISSION','CANCELLED')),
  recipe TEXT NOT NULL, recipe_version TEXT, character_image_url TEXT NOT NULL, product_image_url TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 4 AND 15), ratio TEXT NOT NULL, audio INTEGER NOT NULL DEFAULT 0 CHECK(audio IN (0,1)), product_info TEXT NOT NULL, user_concept TEXT NOT NULL, caption TEXT, link TEXT,
  expected_credits INTEGER NOT NULL CHECK(expected_credits > 0), rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(rights_confirmed IN (0,1)), ai_disclosure_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(ai_disclosure_confirmed IN (0,1)), storage_key TEXT, storage_etag TEXT, storage_size_bytes INTEGER, storage_content_type TEXT, qa_status TEXT, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0), max_attempts INTEGER NOT NULL DEFAULT 2 CHECK(max_attempts BETWEEN 1 AND 5), next_attempt_at TEXT, last_error_code TEXT, last_error_stage TEXT, last_error_detail TEXT, scheduled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, generated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runway_jobs_active_fingerprint ON runway_generation_jobs(request_fingerprint) WHERE status IN ('DRAFT','APPROVED','BUDGET_RESERVED','SUBMITTING','PROCESSING','GENERATED_REVIEW_REQUIRED','APPROVED_FOR_POST','AMBIGUOUS_SUBMISSION');
-- At most one paid generation may be reserved/submitted at a time. The constant
-- expression makes all active rows collide even when two Cron invocations race.
CREATE UNIQUE INDEX IF NOT EXISTS idx_runway_jobs_single_paid_active
  ON runway_generation_jobs((1))
  WHERE status IN ('BUDGET_RESERVED','SUBMITTING','PROCESSING','AMBIGUOUS_SUBMISSION');
CREATE TABLE IF NOT EXISTS runway_generation_attempts (
  attempt_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES runway_generation_jobs(job_id), attempt_number INTEGER NOT NULL CHECK(attempt_number > 0), status TEXT NOT NULL, provider_task_id TEXT UNIQUE, expected_credits INTEGER NOT NULL CHECK(expected_credits > 0), error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(job_id,attempt_number)
);
CREATE TABLE IF NOT EXISTS runway_cost_reservations (
  reservation_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES runway_generation_attempts(attempt_id), job_id TEXT NOT NULL REFERENCES runway_generation_jobs(job_id), scope TEXT NOT NULL CHECK(scope IN ('TEST','MONTH')), period_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('RESERVED','SUBMITTED','UNKNOWN','SETTLED','RELEASED')), credits INTEGER NOT NULL CHECK(credits > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(attempt_id,scope)
);
CREATE TABLE IF NOT EXISTS runway_provider_usage_daily (usage_date TEXT NOT NULL, model TEXT NOT NULL, credits INTEGER NOT NULL DEFAULT 0, request_count INTEGER NOT NULL DEFAULT 0, fetched_at TEXT NOT NULL, PRIMARY KEY(usage_date,model));
CREATE TABLE IF NOT EXISTS runway_approval_grants (grant_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES runway_generation_jobs(job_id), granted_by TEXT NOT NULL, scope TEXT NOT NULL, granted_at TEXT NOT NULL, expires_at TEXT);
CREATE TABLE IF NOT EXISTS runway_audit_log (audit_id TEXT PRIMARY KEY, job_id TEXT, attempt_id TEXT, event TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL);

-- Local reservations are a second, database-level fuse. Provider usage is checked
-- by the Worker immediately before this insert; these triggers prevent concurrent
-- local reservations from crossing either user-approved limit.
CREATE TRIGGER IF NOT EXISTS trg_runway_test_reservation_cap
BEFORE INSERT ON runway_cost_reservations
WHEN NEW.scope='TEST' AND NEW.status IN ('RESERVED','SUBMITTED','UNKNOWN','SETTLED')
  AND (SELECT initial_test_completed FROM runway_budget_policy WHERE policy_id=1)=0
BEGIN
  SELECT CASE WHEN (
    COALESCE((SELECT SUM(credits) FROM runway_cost_reservations
      WHERE scope='TEST' AND period_key=NEW.period_key
      AND status IN ('RESERVED','SUBMITTED','UNKNOWN','SETTLED')),0) + NEW.credits
  ) > (SELECT initial_cap_credits FROM runway_budget_policy WHERE policy_id=1)
  THEN RAISE(ABORT,'RUNWAY_INITIAL_TEST_LIMIT') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_runway_month_reservation_cap
BEFORE INSERT ON runway_cost_reservations
WHEN NEW.scope='MONTH' AND NEW.status IN ('RESERVED','SUBMITTED','UNKNOWN','SETTLED')
BEGIN
  SELECT CASE WHEN (
    COALESCE((SELECT SUM(credits) FROM runway_cost_reservations
      WHERE scope='MONTH' AND period_key=NEW.period_key
      AND status IN ('RESERVED','SUBMITTED','UNKNOWN','SETTLED')),0) + NEW.credits
  ) > (SELECT monthly_cap_credits FROM runway_budget_policy WHERE policy_id=1)
  THEN RAISE(ABORT,'RUNWAY_MONTHLY_LIMIT') END;
END;
CREATE INDEX IF NOT EXISTS idx_runway_jobs_status_schedule ON runway_generation_jobs(status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_runway_attempts_job ON runway_generation_attempts(job_id,attempt_number);
CREATE INDEX IF NOT EXISTS idx_runway_reservations_period ON runway_cost_reservations(scope,period_key,status);
