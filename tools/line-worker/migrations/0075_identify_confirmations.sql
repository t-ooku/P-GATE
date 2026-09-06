-- 2026-09-06 大隆さん指示「スピードも大切だけど、探したい商品が見つかることが大切。
-- 一度やった検索は D1 があるからそこから回答すれば良い」。
--
-- 「これですか？」に対する YES / NO の答えを残す。同じ質問が来たら Gemini を呼ばずに
-- D1 から即答し、NO で否定された候補は次の候補出しに「これは違う」として渡す。
-- これで、同じ間違いを繰り返さず、2回目以降は速くて正確になる。
--
-- 残すのは「正規化した質問文のハッシュ」「言語」「確定した候補」「否定された候補名」だけ。
-- 質問文そのもの・会員ID・セッションID・価格は入れない。
CREATE TABLE IF NOT EXISTS identify_confirmations (
  query_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  confirmed_json TEXT NOT NULL DEFAULT '',
  rejected_json TEXT NOT NULL DEFAULT '[]',
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (query_hash, language)
);
CREATE INDEX IF NOT EXISTS idx_identify_confirmations_updated ON identify_confirmations(updated_at);
