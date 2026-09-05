-- 2026-09-05 大隆さん指示: インフルエンサー（クリエイター）直接募集の応募・報告・質問フォーム（/for-creators）
CREATE TABLE IF NOT EXISTS creator_inquiries (
  inquiry_id TEXT PRIMARY KEY,
  inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('APPLY','REPORT_POST','QUESTION')),
  creator_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  platforms TEXT NOT NULL DEFAULT '[]',
  account_url TEXT NOT NULL DEFAULT '',
  follower_range TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  post_url TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','APPROVED','REJECTED','CLOSED')),
  source TEXT NOT NULL DEFAULT 'FOR_CREATORS',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_creator_inquiries_status_created
  ON creator_inquiries(status, created_at DESC);
