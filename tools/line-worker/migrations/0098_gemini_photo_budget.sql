-- 2026-11-14 大隆さん承認: 写真解析の上位モデルは月 3,000 円まで。上限に達したら今のモデルへ戻す。
-- 呼ぶ前に見込み額を確保し（先に枠を取る）、応答のトークン数で実額に精算する。単位は 100 万分の 1 円。
-- 表が無い・D1 が失敗した時は、アプリ側で上位モデルを使わない（上限を超えない側）。
CREATE TABLE IF NOT EXISTS gemini_photo_usage_monthly (
  usage_month TEXT PRIMARY KEY,
  spent_micro_jpy INTEGER NOT NULL DEFAULT 0 CHECK (spent_micro_jpy >= 0),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  monthly_budget_jpy INTEGER NOT NULL CHECK (monthly_budget_jpy >= 0 AND monthly_budget_jpy <= 3000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
