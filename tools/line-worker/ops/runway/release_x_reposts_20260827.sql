-- HOSHILU公式X (@hoshilu_app) への再投稿を最終承認する書き込み。
-- 2行の内容と安全条件がすべて一致した場合だけ、同時にAPPROVEDへ進める。
-- このUPDATEの後に続く文は無い。
UPDATE social_post_queue
SET status='APPROVED',
    scheduled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    last_error='',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE post_id IN (
    'hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827',
    'hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827'
  )
  AND platform='X'
  AND campaign_id='hoshilu-runway-video'
  AND status='REVIEW_REQUIRED'
  AND affiliate=0
  AND external_post_id=''
  AND platform_job_id=''
  AND published_at=''
  AND (
    (
      post_id='hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827'
      AND content_id='runway-hoshilu-name-forgotten-20260819-v1'
      AND caption='Qoo10やSHEINで見たのに、商品名を忘れた。覚えている色・形・使い方を話すだけ。AIが特徴を理解し、HOSHILUが商品を探します。※この動画はAI生成・AI加工映像です。 #Qoo10購入品 #SHEIN購入品'
      AND link='https://hoshilu.app/?utm_source=x&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_name_forgotten_20260819_v1_x_repost'
      AND media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-name-forgotten-20260819-v1.mp4'
    )
    OR
    (
      post_id='hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827'
      AND content_id='runway-hoshilu-overseas-find-20260819-v2'
      AND caption='海外やQoo10・SHEINで見かけた「あれ」、日本でも探せる。覚えている特徴を話すだけ。AIが理解し、HOSHILUが探します。※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #海外通販'
      AND link='https://hoshilu.app/?utm_source=x&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_overseas_find_20260819_v2_x_repost'
      AND media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-overseas-find-20260819-v2.mp4'
    )
  )
  AND 2=(
    SELECT COUNT(*) FROM social_post_queue
    WHERE platform='X'
      AND campaign_id='hoshilu-runway-video'
      AND status='REVIEW_REQUIRED'
      AND affiliate=0
      AND external_post_id=''
      AND platform_job_id=''
      AND published_at=''
      AND (
        (
          post_id='hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827'
          AND content_id='runway-hoshilu-name-forgotten-20260819-v1'
          AND caption='Qoo10やSHEINで見たのに、商品名を忘れた。覚えている色・形・使い方を話すだけ。AIが特徴を理解し、HOSHILUが商品を探します。※この動画はAI生成・AI加工映像です。 #Qoo10購入品 #SHEIN購入品'
          AND link='https://hoshilu.app/?utm_source=x&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_name_forgotten_20260819_v1_x_repost'
          AND media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-name-forgotten-20260819-v1.mp4'
        )
        OR
        (
          post_id='hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827'
          AND content_id='runway-hoshilu-overseas-find-20260819-v2'
          AND caption='海外やQoo10・SHEINで見かけた「あれ」、日本でも探せる。覚えている特徴を話すだけ。AIが理解し、HOSHILUが探します。※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #海外通販'
          AND link='https://hoshilu.app/?utm_source=x&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_overseas_find_20260819_v2_x_repost'
          AND media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-overseas-find-20260819-v2.mp4'
        )
      )
  )
  AND 2=(
    SELECT COUNT(*) FROM runway_generation_jobs
    WHERE job_id IN (
        'runway-hoshilu-name-forgotten-20260819-v1',
        'runway-hoshilu-overseas-find-20260819-v2'
      )
      AND status IN ('APPROVED_FOR_POST','PUBLISHED')
      AND qa_status='PASSED'
      AND rights_confirmed=1
      AND ai_disclosure_confirmed=1
      AND storage_key IS NOT NULL
      AND storage_size_bytes>0
      AND storage_content_type='video/mp4'
  )
  AND 2=(
    SELECT COUNT(*) FROM runway_audit_log
    WHERE audit_id IN (
        'runway-name-forgotten-x-deleted-20260827',
        'runway-overseas-find-x-deleted-20260827'
      )
      AND event='X_POST_DELETED_BY_OWNER'
  )
  AND NOT EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id NOT IN (
        'hoshilu-runway-name-forgotten-20260819-v1-x',
        'hoshilu-runway-overseas-find-20260819-v2-x',
        'hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827',
        'hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827'
      )
      AND platform='X'
      AND (
        content_id IN (
          'runway-hoshilu-name-forgotten-20260819-v1',
          'runway-hoshilu-overseas-find-20260819-v2'
        )
        OR media_url IN (
          'https://hoshilu.app/api/social/media/runway/runway-hoshilu-name-forgotten-20260819-v1.mp4',
          'https://hoshilu.app/api/social/media/runway/runway-hoshilu-overseas-find-20260819-v2.mp4'
        )
      )
      AND (
        status IN ('APPROVED','PUBLISHING','PUBLISHED')
        OR external_post_id<>''
        OR platform_job_id<>''
      )
  );
