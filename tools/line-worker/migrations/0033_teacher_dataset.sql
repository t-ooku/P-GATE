CREATE TABLE IF NOT EXISTS teacher_queries (
  entry_id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  query_text TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('ja','en','ko','zh','mixed')),
  persona TEXT NOT NULL DEFAULT 'general' CHECK(persona IN ('child','elderly','foreign','general')),
  user_intent TEXT NOT NULL,
  ideal_answer TEXT NOT NULL,
  reason TEXT NOT NULL,
  category TEXT NOT NULL,
  search_terms_ja TEXT NOT NULL DEFAULT '[]',
  search_terms_en TEXT NOT NULL DEFAULT '[]',
  search_terms_ko TEXT NOT NULL DEFAULT '[]',
  search_terms_zh TEXT NOT NULL DEFAULT '[]',
  excluded_conditions TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
  actual_ctr REAL CHECK(actual_ctr IS NULL OR (actual_ctr >= 0 AND actual_ctr <= 1)),
  actual_cvr REAL CHECK(actual_cvr IS NULL OR (actual_cvr >= 0 AND actual_cvr <= 1)),
  actual_search_success_rate REAL CHECK(actual_search_success_rate IS NULL OR (actual_search_success_rate >= 0 AND actual_search_success_rate <= 1)),
  source TEXT NOT NULL DEFAULT 'gpt_cto' CHECK(source IN ('gpt_cto','search_log_derived','manual_verified')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REJECTED','SUPERSEDED')),
  batch_id TEXT NOT NULL,
  authored_date TEXT NOT NULL,
  authored_updated_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS teacher_queries_batch
  ON teacher_queries(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS teacher_queries_status_category
  ON teacher_queries(status, category);
CREATE INDEX IF NOT EXISTS teacher_queries_persona
  ON teacher_queries(persona, status);

CREATE TABLE IF NOT EXISTS teacher_rules (
  rule_id TEXT PRIMARY KEY,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('synonym','category_mapping','attribute_inference','exclusion','persona_pattern')),
  pattern TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('ja','en','ko','zh','mixed')),
  maps_to_category TEXT,
  maps_to_attributes TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
  derived_from_entry_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REJECTED','SUPERSEDED')),
  batch_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(rule_type, pattern, locale)
);

CREATE INDEX IF NOT EXISTS teacher_rules_status
  ON teacher_rules(status, rule_type);

CREATE TABLE IF NOT EXISTS teacher_trends (
  trend_id TEXT PRIMARY KEY,
  trend_date TEXT NOT NULL,
  category TEXT NOT NULL,
  trend_keyword TEXT NOT NULL,
  trend_type TEXT NOT NULL CHECK(trend_type IN ('seasonal','viral','regulatory','price_sensitivity','other')),
  description TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
  batch_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(trend_date, category, trend_keyword)
);

CREATE INDEX IF NOT EXISTS teacher_trends_date
  ON teacher_trends(trend_date DESC, category);

CREATE TABLE IF NOT EXISTS teacher_validation (
  validation_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE,
  batch_source TEXT NOT NULL DEFAULT 'gpt_cto',
  validated_at TEXT NOT NULL,
  total_records INTEGER NOT NULL CHECK(total_records >= 0),
  new_records INTEGER NOT NULL CHECK(new_records >= 0),
  duplicate_records_skipped INTEGER NOT NULL CHECK(duplicate_records_skipped >= 0),
  invalid_records_skipped INTEGER NOT NULL DEFAULT 0 CHECK(invalid_records_skipped >= 0),
  regression_test_status TEXT NOT NULL DEFAULT 'NOT_RUN' CHECK(regression_test_status IN ('PASS','FAIL','NOT_RUN')),
  regression_test_summary TEXT,
  applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS teacher_validation_time
  ON teacher_validation(validated_at DESC);
