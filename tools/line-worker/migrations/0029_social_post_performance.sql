CREATE TABLE IF NOT EXISTS social_post_performance (
  snapshot_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('X','INSTAGRAM','TIKTOK','YOUTUBE')),
  snapshot_at TEXT NOT NULL,
  published_at TEXT,
  public_url TEXT,
  concept TEXT,
  cta TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  reach INTEGER CHECK(reach IS NULL OR reach >= 0),
  impressions INTEGER CHECK(impressions IS NULL OR impressions >= 0),
  saves INTEGER CHECK(saves IS NULL OR saves >= 0),
  shares INTEGER CHECK(shares IS NULL OR shares >= 0),
  comments INTEGER CHECK(comments IS NULL OR comments >= 0),
  profile_views INTEGER CHECK(profile_views IS NULL OR profile_views >= 0),
  link_clicks INTEGER CHECK(link_clicks IS NULL OR link_clicks >= 0),
  search_starts INTEGER CHECK(search_starts IS NULL OR search_starts >= 0),
  free_registrations INTEGER CHECK(free_registrations IS NULL OR free_registrations >= 0),
  marketplace_clicks INTEGER CHECK(marketplace_clicks IS NULL OR marketplace_clicks >= 0),
  inquiries INTEGER CHECK(inquiries IS NULL OR inquiries >= 0),
  conversions INTEGER CHECK(conversions IS NULL OR conversions >= 0),
  traffic_class TEXT NOT NULL DEFAULT 'ATTRIBUTED'
    CHECK(traffic_class IN ('QA','INTERNAL','ATTRIBUTED','UNATTRIBUTED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(post_id, snapshot_at),
  FOREIGN KEY(post_id) REFERENCES social_post_queue(post_id)
);

CREATE INDEX IF NOT EXISTS social_post_performance_post_time
  ON social_post_performance(post_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS social_post_performance_reporting
  ON social_post_performance(traffic_class, published_at DESC);
