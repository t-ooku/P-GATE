-- HOSHILU BUZZ Phase 1→2 土台: モール公式ランキングの順位スナップショット。
-- 指示書v3.0 §6🚀/§7/§8: 「急上昇」は実測の順位変化だけを根拠にする。
-- 架空のSNS指標・推定値は保存しない。payload_jsonは公式ランキングAPIが
-- 返した順位・商品名・商品URL・価格のみ。保持は14日(cron側でprune)。
CREATE TABLE IF NOT EXISTS buzz_ranking_snapshots (
  marketplace_id TEXT NOT NULL,
  shelf_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  ranking_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (marketplace_id, shelf_id, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_buzz_snapshots_shelf_time
  ON buzz_ranking_snapshots(shelf_id, captured_at);
