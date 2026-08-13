-- Run only after both the queue and Instagram permalink record prove success.
UPDATE runway_generation_jobs
SET status='PUBLISHED',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE job_id='runway-hoshilu-model-ugc-test-20260813-v1'
  AND post_id='hoshilu-runway-model-ugc-20260813-v1'
  AND status='APPROVED_FOR_POST'
  AND qa_status='PASSED'
  AND storage_key='runway/runway-hoshilu-model-ugc-test-20260813-v1/postprocessed-9e2a3a8079e925c3359bce243ef8b3f363ff204cdac0974c771d38f38d6612ad.mp4'
  AND EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id='hoshilu-runway-model-ugc-20260813-v1'
      AND platform='INSTAGRAM'
      AND status='PUBLISHED'
      AND external_post_id<>''
      AND published_at<>''
      AND last_error=''
  )
  AND EXISTS (
    SELECT 1 FROM social_post_performance
    WHERE post_id='hoshilu-runway-model-ugc-20260813-v1'
      AND platform='INSTAGRAM'
      AND public_url LIKE 'https://%instagram.com/%'
  );

-- Do not release the initial-test cap at approval time. It transitions to the
-- monthly cap only after the queue and permalink independently prove that the
-- first publication completed.
UPDATE runway_budget_policy
SET initial_test_completed=1,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE policy_id=1
  AND initial_cap_credits=1000
  AND monthly_cap_credits=3000
  AND enabled=1
  AND kill_switch=0
  AND initial_test_completed=0
  AND EXISTS (
    SELECT 1 FROM runway_generation_jobs
    WHERE job_id='runway-hoshilu-model-ugc-test-20260813-v1'
      AND status='PUBLISHED'
      AND qa_status='PASSED'
  )
  AND EXISTS (
    SELECT 1 FROM social_post_queue q
    JOIN social_post_performance p ON p.post_id=q.post_id
    WHERE q.post_id='hoshilu-runway-model-ugc-20260813-v1'
      AND q.status='PUBLISHED'
      AND q.external_post_id<>''
      AND p.platform='INSTAGRAM'
      AND p.public_url LIKE 'https://%instagram.com/%'
  );

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,attempt_id,event,detail,created_at
)
SELECT
  'runway-initial-reel-v4-published-20260813',
  'runway-hoshilu-model-ugc-test-20260813-v1',
  '',
  'PUBLISHED',
  json_object(
    'post_id','hoshilu-runway-model-ugc-20260813-v1',
    'external_post_id',q.external_post_id,
    'public_url',p.public_url,
    'published_at',q.published_at
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM social_post_queue q
JOIN social_post_performance p ON p.post_id=q.post_id
WHERE q.post_id='hoshilu-runway-model-ugc-20260813-v1'
  AND q.status='PUBLISHED'
  AND p.platform='INSTAGRAM'
  AND p.public_url LIKE 'https://%instagram.com/%'
  AND EXISTS (
    SELECT 1 FROM runway_generation_jobs
    WHERE job_id='runway-hoshilu-model-ugc-test-20260813-v1'
      AND status='PUBLISHED'
  )
ORDER BY p.snapshot_at DESC
LIMIT 1;
