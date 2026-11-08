-- 2026-11-08 大隆さん（office hours → B「通知で戻ってくる」、「とりあえず進めて」）:
-- 値下がりカードの「もっと下がったらLINEで知らせる」。メール登録なしで、LINE の送信だけで商品の見張りを始める。
-- 入れるのは LINE の userId（push に要る）と商品の公開情報（record_key・商品名・HOSHILU が記録した価格）だけ。
-- 検索文・会員 ID・メールアドレスは入れない。
CREATE TABLE IF NOT EXISTS line_watch_codes (
  code TEXT PRIMARY KEY,
  record_key TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS line_price_watches (
  line_user_id TEXT NOT NULL,
  record_key TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  start_price INTEGER NOT NULL CHECK(start_price > 0),
  notified_price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','STOPPED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notified_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (line_user_id, record_key)
);
CREATE INDEX IF NOT EXISTS idx_line_price_watches_status ON line_price_watches(status, updated_at);
-- 月の push 通数（LINE の無料通数を超えないための上限の判定だけに使う。宛先は入れない）
CREATE TABLE IF NOT EXISTS line_watch_pushes (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  pushed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_line_watch_pushes_month ON line_watch_pushes(month);
