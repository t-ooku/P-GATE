-- リール第3弾ジョブの開始予約時刻の修正。
--
-- reel_job_20260819_overseas_find_v1.sql の scheduled_at に
-- '2026-08-19T12:00:00.000Z' と書いたが、これはUTCの12:00 = JSTの21:00で、
-- 「今すぐ生成」のつもりが今夜21時開始の予約になっていた(Claudeの時刻換算ミス)。
-- 生成サイクルは scheduled_at <= 現在時刻 のジョブだけを拾うため、
-- ジョブは APPROVED のまま待機していた(attempts=0, last_error無しで確認済み)。
--
-- 既に過ぎた時刻へ前倒しし、次の15分cronで拾われるようにする。
-- 対象は当該ジョブ1行のみ、状態がAPPROVED(未着手)の場合のみ。
UPDATE runway_generation_jobs
SET scheduled_at = '2026-08-19T03:00:00.000Z',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE job_id = 'runway-hoshilu-overseas-find-20260819-v1'
  AND status = 'APPROVED'
  AND attempt_count = 0
  AND scheduled_at = '2026-08-19T12:00:00.000Z';
