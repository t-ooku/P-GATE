-- 2026-09-06 大隆さん指示（AI検索ハイブリッド化）: 「これですか？」の確認カードを最短で出す。
-- Gemini の候補判定（3.5秒）と参考画像の取得（最大5秒）は同じ質問なら毎回同じ答えになるので、
-- 正規化した質問文＋言語のハッシュで結果ごと保存し、2回目以降は D1 の1回読みだけで返す。
-- 生鮮情報（価格）は入れない。保存するのは候補名・理由・画像URLなど、確認カードに出すものだけ。
CREATE TABLE IF NOT EXISTS ai_identify_cache (
  cache_key TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  payload TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_identify_cache_expires ON ai_identify_cache(expires_at);
