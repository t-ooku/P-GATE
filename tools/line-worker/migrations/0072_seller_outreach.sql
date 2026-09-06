-- 2026-09-06 大隆さん決定（Seller獲得マスター指示書 §31-§33・§49、営業メールは Claude が実施 → 大隆さんの
-- Gmail からの送信は安全システムに止まるため、HOSHILU 側の送信基盤（Resend、専用アドレス）から送る）。
-- Claude の日次セッションが D1 に「宛先・件名・本文（個別化済み）」を QUEUED で入れ、Worker の 15分 cron が
-- 平日 09:00〜18:00 JST に 1日10通まで送る。1メールアドレスに1回だけ。配信停止リンク（トークン）で OPTED_OUT。
CREATE TABLE IF NOT EXISTS seller_outreach_contacts (
  contact_id TEXT PRIMARY KEY,
  shop_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','SENDING','SENT','FAILED','OPTED_OUT','REPLIED','SKIPPED')),
  scheduled_at TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT '',
  resend_id TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_outreach_status_sched ON seller_outreach_contacts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_seller_outreach_email_hash ON seller_outreach_contacts(email_hash);

CREATE TABLE IF NOT EXISTS seller_outreach_suppressions (
  email_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'OPTED_OUT',
  created_at TEXT NOT NULL
);
