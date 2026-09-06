-- 2026-09-06 大隆さん指示（AI検索ハイブリッド化「読み込み時間を最短に」）:
-- これまで「確認カードが出るまで何秒かかっているか」を実測していなかった。
-- 直せたかどうかを数字で確認できるように、段階ごとの所要時間だけを残す。
-- 残すのは所要ミリ秒と、キャッシュに当たったかどうかだけ。質問文・画像・
-- 会員ID・セッションIDは一切入れない（誰の検索かは分からない）。
CREATE TABLE IF NOT EXISTS identify_latency_log (
  log_id TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  cache_state TEXT NOT NULL,
  ai_ms INTEGER NOT NULL DEFAULT 0,
  preview_ms INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identify_latency_created ON identify_latency_log(created_at);
