-- AI女優リール第2弾の再公開(repost)準備。
--
-- 経緯: 2026-08-19未明にpost_id 'hoshilu-runway-recommend-voice-20260818-v1'
-- (external_post_id=17902541781477801) としてInstagramへ公開されたが、
-- 一部フレーム(f85前後)で合成した画面がスマホの左下からはみ出す不具合が
-- 残っており、大隆さんがInstagram上の投稿を削除した。
-- レンダラーのベゼル検出を修正した新しい後処理版
-- (sha256=df4088af..., 2,878,075バイト。画素追跡チェーンで画面の揺れも解消)を
-- 同じジョブのメディアとして差し替え、
-- 新しいpost_id '...-v2' で公開をやり直す。
--
-- v1のキュー行は書き換えない(external_post_id・published_atは実際に起きた
-- 公開の記録であり、Instagram側で削除された事実はaudit logに残す)。
UPDATE runway_generation_jobs
SET storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-df4088af79c3ce7a3dd72ccc53448f1db07cf3f9b8610b9496e0005e374b1c5c.mp4',
    storage_etag=NULL,
    storage_size_bytes=2878075,
    storage_content_type='video/mp4',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE job_id='runway-hoshilu-recommend-voice-20260818-v1'
  AND status='APPROVED_FOR_POST'
  AND qa_status='PASSED'
  AND rights_confirmed=1
  AND ai_disclosure_confirmed=1
  AND storage_key IN (
    'runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2.mp4',
    'runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-df4088af79c3ce7a3dd72ccc53448f1db07cf3f9b8610b9496e0005e374b1c5c.mp4'
  );

INSERT OR IGNORE INTO social_post_queue (
  post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
  affiliate,created_at,updated_at
)
SELECT
  'hoshilu-runway-recommend-voice-20260818-v2',
  'INSTAGRAM',
  'hoshilu-runway-video',
  'runway-hoshilu-recommend-voice-20260818-v1',
  '名前が分からなくても、覚えている特徴から探せる。見つかった商品は、まとめて比較する2モールに加えて最大13モールで探せます。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成',
  'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_recommend_voice_20260818_v1',
  'https://hoshilu.app/api/social/media/runway/runway-hoshilu-recommend-voice-20260818-v1.mp4',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'REVIEW_REQUIRED',
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM runway_generation_jobs
  WHERE job_id='runway-hoshilu-recommend-voice-20260818-v1'
    AND status='APPROVED_FOR_POST'
    AND qa_status='PASSED'
    AND storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-df4088af79c3ce7a3dd72ccc53448f1db07cf3f9b8610b9496e0005e374b1c5c.mp4'
)
AND EXISTS (
  -- v1が「公開済み・その後削除」の想定どおりの状態であることを固定する。
  SELECT 1 FROM social_post_queue
  WHERE post_id='hoshilu-runway-recommend-voice-20260818-v1'
    AND platform='INSTAGRAM'
    AND status='PUBLISHED'
    AND external_post_id='17902541781477801'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,attempt_id,event,detail,created_at
) VALUES (
  'runway-recommend-voice-ig-deleted-20260819',
  'runway-hoshilu-recommend-voice-20260818-v1',
  '',
  'INSTAGRAM_POST_DELETED_BY_OWNER',
  '{"post_id":"hoshilu-runway-recommend-voice-20260818-v1","external_post_id":"17902541781477801","deleted_by":"owner","deleted_date":"2026-08-19","reason":"composited screen overflowed the phone bezel on some frames (around f85); bezel-detection fix applied and superseded by post v2"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,attempt_id,event,detail,created_at
)
SELECT
  'runway-recommend-voice-qa-approved-20260819-v2',
  'runway-hoshilu-recommend-voice-20260818-v1',
  '',
  'QA_APPROVED_FOR_POST',
  '{"checks":["identity_consistent","face_hands_ok","hoshilu_visible","japanese_subtitles","url_visible","audio_present","no_unrelated_brand","factual","ai_disclosure","rights_confirmed","duplicate_checked","postprocessed"],"candidate_sha256":"df4088af79c3ce7a3dd72ccc53448f1db07cf3f9b8610b9496e0005e374b1c5c","supersedes_sha256":"9c012c8e7675a740f5f608a9dac57684dc8ddee7725eda3baa1e26847ef66dd2","raw_output_sha256":"58e2b13087ccc76db0b62218056992675db153d89a12698ea1ecb57ec6ee275e","fix":"bezel overflow fixed (threshold 70->90, opening 9x9->3x3, warm-bright exclusion); wobble fixed by chaining frame-to-frame optical-flow homographies of the raw screen pixels (residual motion vs the real phone 0.15px/frame) and by fixing the luminance gain at 0.70; all 121 replaced frames visually re-inspected","audio_stream_unchanged":true,"caption_ai_text":false,"platform_ai_label":true,"user_approved":"2026-08-19"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM runway_generation_jobs
  WHERE job_id='runway-hoshilu-recommend-voice-20260818-v1'
    AND storage_key='runway/runway-hoshilu-recommend-voice-20260818-v1/postprocessed-df4088af79c3ce7a3dd72ccc53448f1db07cf3f9b8610b9496e0005e374b1c5c.mp4'
);
