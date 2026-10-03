-- 2026-10-03 大隆さん指示（HOSHILU 検索時間を 2 秒短くする）:
-- /api/knowledge の所要時間を段階ごとに残す。直せたかどうかを数字で確認するため。
-- 残すのはミリ秒・入力の種類（文字／写真／投稿URL／確認済み候補）・レーン数・利用区分（QA か実利用者か）だけ。
-- 検索文・画像・会員ID・セッションIDは一切入れない（誰の検索かは分からない）。14 日で消す。
CREATE TABLE IF NOT EXISTS knowledge_latency_log (
  log_id TEXT PRIMARY KEY,
  input_kind TEXT NOT NULL,
  traffic_class TEXT NOT NULL DEFAULT 'UNATTRIBUTED',
  gate_ms INTEGER NOT NULL DEFAULT 0,
  analysis_ms INTEGER NOT NULL DEFAULT 0,
  lookup_ms INTEGER NOT NULL DEFAULT 0,
  marketplace_ms INTEGER NOT NULL DEFAULT 0,
  google_wait_ms INTEGER NOT NULL DEFAULT 0,
  decorate_ms INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  lanes INTEGER NOT NULL DEFAULT 0,
  late_lanes INTEGER NOT NULL DEFAULT 0,
  late_lane_keys TEXT NOT NULL DEFAULT '',
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_latency_created ON knowledge_latency_log(created_at);
