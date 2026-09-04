-- 2026-09-04 総合実行指示書 §66–70 インフルエンサー第三市場: Creator 別計測URL
-- ?creator_id=&campaign_id=&creative_id= で着地した訪問者のイベントに、Creator・施策・クリエイティブを付ける。
-- 個人を特定する情報ではない（運用側が発行する識別子のみ）。
ALTER TABLE growth_events ADD COLUMN creator_id TEXT NOT NULL DEFAULT '';
ALTER TABLE growth_events ADD COLUMN campaign_id TEXT NOT NULL DEFAULT '';
ALTER TABLE growth_events ADD COLUMN creative_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS growth_events_creator_time ON growth_events(creator_id, occurred_at);
