-- Widen social_post_queue.platform to allow 'THREADS'.
-- SQLite cannot ALTER a CHECK constraint in place, so the table must be
-- recreated with the same columns/indexes and the data copied over.
-- Written to be safe to run more than once (see 0053, which follows the
-- same pattern for social_post_performance, for the full rationale).
--
-- social_post_performance.post_id has a FOREIGN KEY into this table, so
-- dropping social_post_queue with FK enforcement on fails even though the
-- recreated table ends up holding the same post_id values. Foreign key
-- checks are turned off only for this recreate step and restored
-- immediately after, matching SQLite's own documented procedure for
-- schema changes on a table that is an FK parent.
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS social_post_queue_0052_next (
  post_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK(platform IN ('X','INSTAGRAM','TIKTOK','THREADS')),
  campaign_id TEXT NOT NULL DEFAULT '',
  content_id TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK(status IN ('REVIEW_REQUIRED','APPROVED','PUBLISHING','PUBLISHED','FAILED','CANCELLED')),
  affiliate INTEGER NOT NULL DEFAULT 0 CHECK(affiliate IN (0,1)),
  external_post_id TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  platform_job_id TEXT NOT NULL DEFAULT ''
);

INSERT INTO social_post_queue_0052_next
  SELECT * FROM social_post_queue;

DROP TABLE social_post_queue;

ALTER TABLE social_post_queue_0052_next RENAME TO social_post_queue;

CREATE INDEX IF NOT EXISTS social_post_due
  ON social_post_queue(status,scheduled_at);

PRAGMA foreign_keys=ON;
