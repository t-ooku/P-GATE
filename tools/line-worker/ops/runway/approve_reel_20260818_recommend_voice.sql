-- AI女優リール第2弾のQA承認。ワークフローはR2の往復バイト比較と、
-- 書き込み前の読み取り専用D1プリフライトを通した後にだけここへ到達する。
-- 非公開のメディア配信ルートを開くが、公開キューは REVIEW_REQUIRED のまま
-- 残す(公開の引き金は release_reel_20260818_recommend_voice.sql だけ)。
UPDATE runway_generation_jobs
SET status='APPROVED_FOR_POST',
    qa_status='PASSED',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE job_id='runway-hoshilu-recommend-voice-20260818-v1'
  AND post_id='hoshilu-runway-recommend-voice-20260818-v1'
  AND status='GENERATED_REVIEW_REQUIRED'
  AND qa_status='PENDING'
  AND rights_confirmed=1
  AND ai_disclosure_confirmed=1
  AND storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2.mp4'
  AND storage_etag IS NULL
  AND storage_size_bytes=2946863
  AND storage_content_type='video/mp4'
  AND caption='名前が分からなくても、覚えている特徴から探せる。見つかった商品は、まとめて比較する2モールに加えて最大13モールで探せます。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成'
  AND EXISTS (
    SELECT 1 FROM social_post_queue
    WHERE post_id='hoshilu-runway-recommend-voice-20260818-v1'
      AND platform='INSTAGRAM'
      AND campaign_id='hoshilu-runway-video'
      AND content_id='runway-hoshilu-recommend-voice-20260818-v1'
      AND status='REVIEW_REQUIRED'
      AND caption='名前が分からなくても、覚えている特徴から探せる。見つかった商品は、まとめて比較する2モールに加えて最大13モールで探せます。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成'
      AND external_post_id=''
      AND platform_job_id=''
      AND published_at=''
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

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,attempt_id,event,detail,created_at
)
SELECT
  'runway-recommend-voice-qa-approved-20260818',
  'runway-hoshilu-recommend-voice-20260818-v1',
  '',
  'QA_APPROVED_FOR_POST',
  '{"checks":["identity_consistent","face_hands_ok","hoshilu_visible","japanese_subtitles","url_visible","audio_present","no_unrelated_brand","factual","ai_disclosure","rights_confirmed","duplicate_checked","postprocessed"],"candidate_sha256":"9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2","raw_output_sha256":"58e2b13087ccc76db0b62218056992675db153d89a12698ea1ecb57ec6ee275e","approved_visual_source_sha256":"0808fd0e65b9dd4fa832b6403842ba451bd0a722f27c58c396db7d85bbbf0bdb","generated_screen_replaced_frames":121,"total_frames":193,"audio_stream_unchanged":true,"caption_ai_text":false,"platform_ai_label":true,"user_approved":"2026-08-18","user_audio_confirmed":"2026-08-18"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM runway_generation_jobs
  WHERE job_id='runway-hoshilu-recommend-voice-20260818-v1'
    AND status='APPROVED_FOR_POST'
    AND qa_status='PASSED'
)
AND EXISTS (
  SELECT 1 FROM social_post_queue
  WHERE post_id='hoshilu-runway-recommend-voice-20260818-v1'
    AND status='REVIEW_REQUIRED'
);
