-- AI女優リール第2弾: 大隆さんが目視確認した後処理済みバイト列だけを登録する。
--
-- このファイルは両方のゲートを REVIEW_REQUIRED / PENDING のまま残す。
-- どちらの文の後で失敗しても、メディアが公開されたり投稿されたりはしない。
--
-- キャプションも同時に更新する。生成時のキャプションは「複数モールをまとめて
-- 比較」だったが、実際にまとめて価格比較できるのは楽天市場とYahoo!ショッピング
-- の2モールで、残りは検索リンクである(サイト本文の「まとめて比較する2モールに
-- 加え、最大13モールで探せます」が正確な表現)。焼き込んだ字幕もこの表現に
-- 合わせたため、キャプションも一致させる。
UPDATE runway_generation_jobs
SET storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2.mp4',
    storage_etag=NULL,
    storage_size_bytes=2946863,
    storage_content_type='video/mp4',
    caption='名前が分からなくても、覚えている特徴から探せる。見つかった商品は、まとめて比較する2モールに加えて最大13モールで探せます。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE job_id='runway-hoshilu-recommend-voice-20260818-v1'
  AND post_id='hoshilu-runway-recommend-voice-20260818-v1'
  AND status='GENERATED_REVIEW_REQUIRED'
  AND qa_status='PENDING'
  AND expected_credits=336
  AND rights_confirmed=1
  AND ai_disclosure_confirmed=1
  AND attempt_count=1
  AND max_attempts=1
  AND (
    (storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/output.mp4'
      AND storage_size_bytes=3457707)
    OR
    (storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2.mp4'
      AND storage_size_bytes=2946863
      AND storage_content_type='video/mp4'
      AND storage_etag IS NULL)
  )
  AND EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id='hoshilu-runway-recommend-voice-20260818-v1'
      AND platform='INSTAGRAM'
      AND campaign_id='hoshilu-runway-video'
      AND content_id='runway-hoshilu-recommend-voice-20260818-v1'
      AND status='REVIEW_REQUIRED'
      AND external_post_id=''
      AND platform_job_id=''
      AND published_at=''
  );

UPDATE social_post_queue
SET caption='名前が分からなくても、覚えている特徴から探せる。見つかった商品は、まとめて比較する2モールに加えて最大13モールで探せます。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE post_id='hoshilu-runway-recommend-voice-20260818-v1'
  AND platform='INSTAGRAM'
  AND campaign_id='hoshilu-runway-video'
  AND content_id='runway-hoshilu-recommend-voice-20260818-v1'
  AND link='https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_recommend_voice_20260818_v1'
  AND media_url='https://hoshilu.app/api/social/media/runway/runway-hoshilu-recommend-voice-20260818-v1.mp4'
  AND status='REVIEW_REQUIRED'
  AND affiliate=0
  AND external_post_id=''
  AND platform_job_id=''
  AND published_at=''
  AND EXISTS (
    SELECT 1 FROM runway_generation_jobs
    WHERE job_id='runway-hoshilu-recommend-voice-20260818-v1'
      AND post_id='hoshilu-runway-recommend-voice-20260818-v1'
      AND status='GENERATED_REVIEW_REQUIRED'
      AND qa_status='PENDING'
      AND storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2.mp4'
      AND storage_etag IS NULL
      AND storage_size_bytes=2946863
      AND storage_content_type='video/mp4'
  );
