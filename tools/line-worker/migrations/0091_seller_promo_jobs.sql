-- 2026-10-03 HOSHILU Seller「AI販促担当」週次ジョブと納品物。追加のみ。
CREATE TABLE IF NOT EXISTS seller_promo_jobs (
  id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','RUNNING','DONE','FAILED','SKIPPED')),
  started_at TEXT NOT NULL DEFAULT '',
  finished_at TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  attempt INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(seller_key, week_key)
);
CREATE INDEX IF NOT EXISTS idx_seller_promo_jobs_status ON seller_promo_jobs(status, week_key);

CREATE TABLE IF NOT EXISTS seller_promo_deliverables (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  seller_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ARTICLE','SNS','IMPROVEMENT','IMAGE','REPORT')),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','QA_PASSED','QA_FAILED','APPROVED','REJECTED','PUBLISHED','CONFIRMING','DELIVERED','PUBLISH_FAILED')),
  payload TEXT NOT NULL DEFAULT '{}',
  qa TEXT NOT NULL DEFAULT '{}',
  approved_by TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  rejected_reason TEXT NOT NULL DEFAULT '',
  published_target TEXT NOT NULL DEFAULT '',
  published_url TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT '',
  UNIQUE(seller_key, week_key, type, version)
);
CREATE INDEX IF NOT EXISTS idx_seller_promo_deliverables_seller ON seller_promo_deliverables(seller_key, week_key, type);
CREATE INDEX IF NOT EXISTS idx_seller_promo_deliverables_type ON seller_promo_deliverables(type, created_at);
