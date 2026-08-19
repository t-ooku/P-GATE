-- リール第3弾(再投入v2)の開始予約をもう一度前倒しする。
--
-- 0055と同種のClaudeの時刻換算ミス。再投入SQLに '2026-08-19T06:30:00.000Z'
-- (=JST 15:30)、第4弾に '2026-08-19T06:00:00.000Z' (=JST 15:00) と書いたが、
-- 作成時点の現在時刻は約04:00Z台で、どちらも未来の予約になっていた。
-- さらに第4弾の予約が第3弾より早く、生成順が意図(第3弾→第4弾)と逆になる。
--
-- 第3弾を過去時刻へ前倒しし、次の15分cronで最初に拾わせる。第4弾(06:00Z)は
-- そのままで良い: 第3弾が生成されるとGENERATED_REVIEW_REQUIREDの間は次の
-- ジョブが投入されない設計のため、第3弾のQA承認後に自動で第4弾が続く。
UPDATE runway_generation_jobs
SET scheduled_at = '2026-08-19T04:00:00.000Z',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE job_id = 'runway-hoshilu-overseas-find-20260819-v2'
  AND status = 'APPROVED'
  AND attempt_count = 0
  AND scheduled_at = '2026-08-19T06:30:00.000Z';
