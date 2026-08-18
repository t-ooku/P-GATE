-- 公開直前の最後の書き込み。承認済みメディア配信ルートが期待どおりの長さ・
-- MIMEタイプ・バイト列を返したことをワークフローが確認した後にだけ実行する。
-- このUPDATEの後に続く文は無い。
--
-- ここで status='APPROVED' にすると、既存のcronがInstagramへ公開する。
UPDATE social_post_queue
SET status='APPROVED',
    scheduled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    last_error='',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE post_id='hoshilu-runway-recommend-voice-20260818-v1'
  AND platform='INSTAGRAM'
  AND campaign_id='hoshilu-runway-video'
  AND content_id='runway-hoshilu-recommend-voice-20260818-v1'
  AND status='REVIEW_REQUIRED'
  AND caption='名前が分からなくても、覚えている特徴から探せる。見つかった商品は、まとめて比較する2モールに加えて最大13モールで探せます。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成'
  AND link='https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_recommend_voice_20260818_v1'
  AND media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-recommend-voice-20260818-v1.mp4'
  AND external_post_id=''
  AND platform_job_id=''
  AND published_at=''
  AND EXISTS (
    SELECT 1 FROM runway_generation_jobs
    WHERE job_id='runway-hoshilu-recommend-voice-20260818-v1'
      AND post_id='hoshilu-runway-recommend-voice-20260818-v1'
      AND status='APPROVED_FOR_POST'
      AND qa_status='PASSED'
      AND storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2.mp4'
      AND storage_etag IS NULL
      AND storage_size_bytes=2946863
      AND storage_content_type='video/mp4'
  )
  AND EXISTS (
    SELECT 1 FROM runway_audit_log
    WHERE audit_id='runway-recommend-voice-qa-approved-20260818'
      AND job_id='runway-hoshilu-recommend-voice-20260818-v1'
      AND event='QA_APPROVED_FOR_POST'
  )
  AND NOT EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id<>'hoshilu-runway-recommend-voice-20260818-v1'
      AND platform='INSTAGRAM'
      AND (
        content_id='runway-hoshilu-recommend-voice-20260818-v1'
        OR media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-recommend-voice-20260818-v1.mp4'
        OR link='https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_recommend_voice_20260818_v1'
      )
      AND (status IN ('APPROVED','PUBLISHING','PUBLISHED')
        OR external_post_id<>'' OR platform_job_id<>'')
  )
  AND NOT EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id<>'hoshilu-runway-recommend-voice-20260818-v1'
      AND platform='INSTAGRAM'
      AND status IN ('APPROVED','PUBLISHING')
      AND scheduled_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
