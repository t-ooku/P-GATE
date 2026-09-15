CREATE TABLE IF NOT EXISTS social_post_queue (
  post_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK(platform IN ('X','INSTAGRAM','TIKTOK')),
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
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS social_post_due
  ON social_post_queue(status,scheduled_at);
