-- The workflow executes this only after an R2 round-trip byte comparison and
-- a second read-only D1 preflight. It opens the private media route but leaves
-- the publication queue REVIEW_REQUIRED until that route passes HTTP checks.
UPDATE runway_generation_jobs
SET status='APPROVED_FOR_POST',
    qa_status='PASSED',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE job_id='runway-hoshilu-model-ugc-test-20260813-v1'
  AND post_id='hoshilu-runway-model-ugc-20260813-v1'
  AND provider_task_id='b345b9a1-31bc-4421-a7ec-a57b4d9e30be'
  AND status='GENERATED_REVIEW_REQUIRED'
  AND qa_status='PENDING'
  AND rights_confirmed=1
  AND ai_disclosure_confirmed=1
  AND storage_key='runway/runway-hoshilu-model-ugc-test-20260813-v1/postprocessed-9e2a3a8079e925c3359bce243ef8b3f363ff204cdac0974c771d38f38d6612ad.mp4'
  AND storage_etag IS NULL
  AND storage_size_bytes=1566948
  AND storage_content_type='video/mp4'
  AND caption='商品名が分からなくても、覚えている見た目や使い方から探せる言葉へ。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。気になった商品をコメントで教えてね。 #HOSHILU #ホシル #あいまい検索 #商品検索 #13モール横断 #ほしっとく'
  AND EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id='hoshilu-runway-model-ugc-20260813-v1'
      AND platform='INSTAGRAM'
      AND campaign_id='hoshilu-runway-video'
      AND content_id='runway-hoshilu-model-ugc-test-20260813-v1'
      AND status='REVIEW_REQUIRED'
      AND caption='商品名が分からなくても、覚えている見た目や使い方から探せる言葉へ。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。気になった商品をコメントで教えてね。 #HOSHILU #ホシル #あいまい検索 #商品検索 #13モール横断 #ほしっとく'
      AND external_post_id=''
      AND platform_job_id=''
      AND published_at=''
  )
  AND NOT EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id<>'hoshilu-runway-model-ugc-20260813-v1'
      AND platform='INSTAGRAM'
      AND (
        content_id='runway-hoshilu-model-ugc-test-20260813-v1'
        OR media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-model-ugc-test-20260813-v1.mp4'
        OR link='https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_test&utm_content=runway_product_ugc_test_20260813_v1'
      )
      AND (status IN ('APPROVED','PUBLISHING','PUBLISHED')
        OR external_post_id<>'' OR platform_job_id<>'')
  )
  AND NOT EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id<>'hoshilu-runway-model-ugc-20260813-v1'
      AND platform='INSTAGRAM'
      AND status IN ('APPROVED','PUBLISHING')
      AND scheduled_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,attempt_id,event,detail,created_at
)
SELECT
  'runway-initial-reel-v4-qa-approved-20260813',
  'runway-hoshilu-model-ugc-test-20260813-v1',
  '',
  'QA_APPROVED_FOR_POST',
  '{"checks":["identity_consistent","face_hands_ok","hoshilu_visible","japanese_subtitles","url_visible","audio_present","no_unrelated_brand","factual","ai_disclosure","rights_confirmed","duplicate_checked","postprocessed"],"candidate_sha256":"9e2a3a8079e925c3359bce243ef8b3f363ff204cdac0974c771d38f38d6612ad","caption_ai_text":false,"platform_ai_label":true,"user_approved":"2026-08-13"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM runway_generation_jobs
  WHERE job_id='runway-hoshilu-model-ugc-test-20260813-v1'
    AND status='APPROVED_FOR_POST'
    AND qa_status='PASSED'
)
AND EXISTS (
  SELECT 1 FROM social_post_queue
  WHERE post_id='hoshilu-runway-model-ugc-20260813-v1'
    AND status='REVIEW_REQUIRED'
);
