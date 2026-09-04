-- 2026-09-04 総合実行指示書 §16–21 Experience Layer（経験財）MVP
-- 「探すだけでなく選ぶ」まで HOSHILU 内で完結させる。モールの口コミは転載しない。
-- 実利用者（会員ログイン済み）の投稿だけを保存し、AI 生成レビューは入れない。
-- 経験軸はカテゴリごとに動的（バッグ: 自立性/軽さ/容量…、コスメ: 発色/色持ち…）。
-- 検索文・個人情報は保存しない。product_key は商品名の正規化ハッシュ。
CREATE TABLE IF NOT EXISTS experience_reports (
  report_id TEXT PRIMARY KEY,
  product_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  member_hash TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'MEMBER' CHECK(source IN ('MEMBER','CREATOR','SELLER')),
  ratings TEXT NOT NULL DEFAULT '{}',
  would_buy_again INTEGER NOT NULL DEFAULT 0 CHECK(would_buy_again IN (0,1)),
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK(status IN ('PUBLISHED','HIDDEN')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(product_key, member_hash)
);
CREATE INDEX IF NOT EXISTS idx_experience_reports_product ON experience_reports(product_key, status, created_at);
CREATE INDEX IF NOT EXISTS idx_experience_reports_member_day ON experience_reports(member_hash, created_at);
