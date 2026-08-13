-- FINAL PRE-PUBLICATION MUTATION. The workflow reaches this file only after
-- the approved media route returns the expected full length, range response,
-- MIME type and bytes. No other statement follows this UPDATE.
UPDATE social_post_queue
SET status='APPROVED',
    scheduled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    last_error='',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE post_id='hoshilu-runway-model-ugc-20260813-v1'
  AND platform='INSTAGRAM'
  AND campaign_id='hoshilu-runway-video'
  AND content_id='runway-hoshilu-model-ugc-test-20260813-v1'
  AND status='REVIEW_REQUIRED'
  AND caption='商品名が分からなくても、覚えている見た目や使い方から探せる言葉へ。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。気になった商品をコメントで教えてね。 #HOSHILU #ホシル #あいまい検索 #商品検索 #13モール横断 #ほしっとく'
  AND link='https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_test&utm_content=runway_product_ugc_test_20260813_v1'
  AND media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-model-ugc-test-20260813-v1.mp4'
  AND external_post_id=''
  AND platform_job_id=''
  AND published_at=''
  AND EXISTS (
    SELECT 1 FROM runway_generation_jobs
    WHERE job_id='runway-hoshilu-model-ugc-test-20260813-v1'
      AND post_id='hoshilu-runway-model-ugc-20260813-v1'
      AND status='APPROVED_FOR_POST'
      AND qa_status='PASSED'
      AND storage_key='runway/runway-hoshilu-model-ugc-test-20260813-v1/postprocessed-9e2a3a8079e925c3359bce243ef8b3f363ff204cdac0974c771d38f38d6612ad.mp4'
      AND storage_etag IS NULL
      AND storage_size_bytes=1566948
      AND storage_content_type='video/mp4'
  )
  AND EXISTS (
    SELECT 1 FROM runway_audit_log
    WHERE audit_id='runway-initial-reel-v4-qa-approved-20260813'
      AND job_id='runway-hoshilu-model-ugc-test-20260813-v1'
      AND event='QA_APPROVED_FOR_POST'
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
