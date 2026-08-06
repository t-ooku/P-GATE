-- HOSHILU GAS→Web移行: gas/SocialKnowledgeEngine.gs のSocial_Knowledge_Inbox /
-- Social_Knowledge_Aggregates / Social_Hashtag_Aggregatesシートに相当するD1
-- スキーマ。人手審査(Review_Status編集)による承認ワークフローのUIは、
-- docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §4.6により未着手
-- (UI/権限設計をユーザーと合意してから実装する)。ここではingest/moderate/
-- review/rebuildAggregatesのロジックとデータ層だけをWorker/D1へ移植する。

CREATE TABLE IF NOT EXISTS social_knowledge_inbox (
  response_id TEXT PRIMARY KEY,
  collected_at TEXT NOT NULL,
  source TEXT NOT NULL,
  post_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL DEFAULT '',
  response_type TEXT NOT NULL,
  response_text_redacted TEXT NOT NULL DEFAULT '',
  poll_option TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'JA',
  consent_basis TEXT NOT NULL,
  disclosure_version TEXT NOT NULL,
  author_hash TEXT NOT NULL DEFAULT '',
  duplicate_hash TEXT NOT NULL,
  suggested_category TEXT NOT NULL DEFAULT '',
  suggested_need_key TEXT NOT NULL DEFAULT '',
  approved_category TEXT NOT NULL DEFAULT '',
  approved_need_key TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL DEFAULT '',
  exclusion_reason TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS social_knowledge_inbox_duplicate_hash
  ON social_knowledge_inbox (duplicate_hash);
CREATE INDEX IF NOT EXISTS social_knowledge_inbox_review_status
  ON social_knowledge_inbox (review_status);

CREATE TABLE IF NOT EXISTS social_knowledge_aggregates (
  need_key TEXT NOT NULL,
  category TEXT NOT NULL,
  language TEXT NOT NULL,
  response_count INTEGER NOT NULL DEFAULT 0,
  unique_authors INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  campaign_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (need_key, category, language)
);

CREATE TABLE IF NOT EXISTS social_hashtag_aggregates (
  hashtag TEXT PRIMARY KEY,
  response_count INTEGER NOT NULL DEFAULT 0,
  unique_authors INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  campaign_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
