-- 2026-09-20 GPT 指示書 §5（大隆さん承認 2026-09-20）: 「ホシる中」の条件を本人が
-- 「もう探さない」で終わらせられるようにする（archived）。
--
-- 決めたこと:
--   archived      = 本人が「もう探さない」と決めた終了状態。一覧から消える。履歴としては残す（行は消さない）。
--   「あとで見る」  = 一時停止。一覧に残り、いつでも再開できる（notify_new_match=0 / insight_enabled_at NULL の既存表現のまま）。
--
-- 追加のみ・非破壊。既存行は archived_at IS NULL（＝これまでどおり）で始まる。
-- 既存データの書き換えもインデックスの作り直しもしない。
ALTER TABLE member_wishes ADD COLUMN archived_at TEXT;

-- 一覧は「archive されていない行を新しい順」で引くので、その形に合わせた部分インデックス。
CREATE INDEX IF NOT EXISTS idx_member_wishes_active
  ON member_wishes (member_id, updated_at DESC)
  WHERE archived_at IS NULL;
