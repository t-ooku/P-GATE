-- HOSHILU公式X (@hoshilu_app) で削除済みとなったRunway動画2本を、
-- 新しいpost_idで再投稿するための「確認待ち」登録。
--
-- 旧行は実際に公開された履歴なので書き換えない。X上で投稿が削除された事実は
-- runway_audit_logへ記録し、新しい行はREVIEW_REQUIREDのまま停止する。
-- このファイルにはAPPROVEDへの更新を置かない。

INSERT OR IGNORE INTO social_post_queue (
  post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
  affiliate,created_at,updated_at
)
SELECT
  'hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827',
  'X',
  'hoshilu-runway-video',
  'runway-hoshilu-name-forgotten-20260819-v1',
  'Qoo10やSHEINで見たのに、商品名を忘れた。覚えている色・形・使い方を話すだけ。AIが特徴を理解し、HOSHILUが商品を探します。※この動画はAI生成・AI加工映像です。 #Qoo10購入品 #SHEIN購入品',
  'https://hoshilu.app/?utm_source=x&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_name_forgotten_20260819_v1_x_repost',
  'https://hoshilu.app/api/social/media/runway/runway-hoshilu-name-forgotten-20260819-v1.mp4',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'REVIEW_REQUIRED',
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM runway_generation_jobs
  WHERE job_id='runway-hoshilu-name-forgotten-20260819-v1'
    AND status IN ('APPROVED_FOR_POST','PUBLISHED')
    AND qa_status='PASSED'
    AND rights_confirmed=1
    AND ai_disclosure_confirmed=1
    AND storage_key IS NOT NULL
    AND storage_size_bytes>0
    AND storage_content_type='video/mp4'
)
AND EXISTS (
  SELECT 1 FROM social_post_queue
  WHERE post_id='hoshilu-runway-name-forgotten-20260819-v1-x'
    AND platform='X'
    AND status='PUBLISHED'
    AND external_post_id='2092837231291502616'
);

INSERT OR IGNORE INTO social_post_queue (
  post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
  affiliate,created_at,updated_at
)
SELECT
  'hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827',
  'X',
  'hoshilu-runway-video',
  'runway-hoshilu-overseas-find-20260819-v2',
  '海外やQoo10・SHEINで見かけた「あれ」、日本でも探せる。覚えている特徴を話すだけ。AIが理解し、HOSHILUが探します。※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #海外通販',
  'https://hoshilu.app/?utm_source=x&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_overseas_find_20260819_v2_x_repost',
  'https://hoshilu.app/api/social/media/runway/runway-hoshilu-overseas-find-20260819-v2.mp4',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'REVIEW_REQUIRED',
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM runway_generation_jobs
  WHERE job_id='runway-hoshilu-overseas-find-20260819-v2'
    AND status IN ('APPROVED_FOR_POST','PUBLISHED')
    AND qa_status='PASSED'
    AND rights_confirmed=1
    AND ai_disclosure_confirmed=1
    AND storage_key IS NOT NULL
    AND storage_size_bytes>0
    AND storage_content_type='video/mp4'
)
AND EXISTS (
  SELECT 1 FROM social_post_queue
  WHERE post_id='hoshilu-runway-overseas-find-20260819-v2-x'
    AND platform='X'
    AND status='PUBLISHED'
    AND external_post_id='2092874950390718829'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,attempt_id,event,detail,created_at
)
SELECT
  'runway-name-forgotten-x-deleted-20260827',
  'runway-hoshilu-name-forgotten-20260819-v1',
  '',
  'X_POST_DELETED_BY_OWNER',
  '{"post_id":"hoshilu-runway-name-forgotten-20260819-v1-x","external_post_id":"2092837231291502616","deleted_by":"owner","deleted_date":"2026-08-27","superseded_by":"hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM social_post_queue
  WHERE post_id='hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827'
    AND status='REVIEW_REQUIRED'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,attempt_id,event,detail,created_at
)
SELECT
  'runway-overseas-find-x-deleted-20260827',
  'runway-hoshilu-overseas-find-20260819-v2',
  '',
  'X_POST_DELETED_BY_OWNER',
  '{"post_id":"hoshilu-runway-overseas-find-20260819-v2-x","external_post_id":"2092874950390718829","deleted_by":"owner","deleted_date":"2026-08-27","superseded_by":"hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM social_post_queue
  WHERE post_id='hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827'
    AND status='REVIEW_REQUIRED'
);
