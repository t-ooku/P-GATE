-- Stage only the exact post-processed bytes approved by the user. This file
-- deliberately leaves both gates in REVIEW_REQUIRED/PENDING. A failure after
-- either statement therefore cannot make the media public or publish it.
UPDATE runway_generation_jobs
SET storage_key='runway/runway-hoshilu-model-ugc-test-20260813-v1/postprocessed-88e65826b923bbf11cfcf99228367a629c76a2eddc51ab661a58be36395b71b9.mp4',
    storage_etag=NULL,
    storage_size_bytes=1565856,
    storage_content_type='video/mp4',
    caption='商品名が分からなくても、覚えている見た目や使い方から探せる言葉へ。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。気になった商品をコメントで教えてね。 #HOSHILU #ホシル #あいまい検索 #商品検索 #13モール横断 #ほしっとく',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE job_id='runway-hoshilu-model-ugc-test-20260813-v1'
  AND post_id='hoshilu-runway-model-ugc-20260813-v1'
  AND provider_task_id='b345b9a1-31bc-4421-a7ec-a57b4d9e30be'
  AND status='GENERATED_REVIEW_REQUIRED'
  AND qa_status='PENDING'
  AND expected_credits=336
  AND rights_confirmed=1
  AND ai_disclosure_confirmed=1
  AND attempt_count=1
  AND max_attempts=1
  AND (
    (storage_key='runway/runway-hoshilu-model-ugc-test-20260813-v1/output.mp4'
      AND storage_size_bytes=3464151)
    OR
    (storage_key='runway/runway-hoshilu-model-ugc-test-20260813-v1/postprocessed-88e65826b923bbf11cfcf99228367a629c76a2eddc51ab661a58be36395b71b9.mp4'
      AND storage_size_bytes=1565856
      AND storage_content_type='video/mp4'
      AND storage_etag IS NULL)
  )
  AND EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id='hoshilu-runway-model-ugc-20260813-v1'
      AND platform='INSTAGRAM'
      AND campaign_id='hoshilu-runway-video'
      AND content_id='runway-hoshilu-model-ugc-test-20260813-v1'
      AND status='REVIEW_REQUIRED'
      AND external_post_id=''
      AND platform_job_id=''
      AND published_at=''
  );

UPDATE social_post_queue
SET caption='商品名が分からなくても、覚えている見た目や使い方から探せる言葉へ。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。気になった商品をコメントで教えてね。 #HOSHILU #ホシル #あいまい検索 #商品検索 #13モール横断 #ほしっとく',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE post_id='hoshilu-runway-model-ugc-20260813-v1'
  AND platform='INSTAGRAM'
  AND campaign_id='hoshilu-runway-video'
  AND content_id='runway-hoshilu-model-ugc-test-20260813-v1'
  AND link='https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_test&utm_content=runway_product_ugc_test_20260813_v1'
  AND media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-model-ugc-test-20260813-v1.mp4'
  AND status='REVIEW_REQUIRED'
  AND affiliate=0
  AND external_post_id=''
  AND platform_job_id=''
  AND published_at=''
  AND EXISTS (
    SELECT 1 FROM runway_generation_jobs
    WHERE job_id='runway-hoshilu-model-ugc-test-20260813-v1'
      AND post_id='hoshilu-runway-model-ugc-20260813-v1'
      AND status='GENERATED_REVIEW_REQUIRED'
      AND qa_status='PENDING'
      AND storage_key='runway/runway-hoshilu-model-ugc-test-20260813-v1/postprocessed-88e65826b923bbf11cfcf99228367a629c76a2eddc51ab661a58be36395b71b9.mp4'
      AND storage_etag IS NULL
      AND storage_size_bytes=1565856
      AND storage_content_type='video/mp4'
  );
