-- AI女優リール第2弾: 「複数モールをまとめて比べられる」を女優の声で案内する。
--
-- ユーザー承認 2026-08-18(原文):「今後のリール投稿は、AI女優を生成して、
-- 他の人も登場されても良いし、スマホ画面を時より映して、おすすめ機能を
-- 女優の声で案内したりあらゆるネタで進めて。予算内であればOk。
-- コーデックスがクレジット切れの間は君の仕事。」
--
-- 予算: 8秒 720:1280 = 336クレジット(calculateProductUgcCreditsと一致必須)。
-- 月間上限3000クレジットの範囲内。参照画像は権利確認済みの既存アセット
-- (承認済みモデル参照画像・HOSHILU画面画像)を再利用し、新規素材は使わない。
--
-- このINSERTは生成までを承認する。生成後は GENERATED_REVIEW_REQUIRED で
-- 停止し、12項目のQAチェックを通す明示的な承認(approve)が無い限り
-- Instagramへは公開されない(既存ガバナンスのまま)。
INSERT OR IGNORE INTO runway_generation_jobs (
  job_id,post_id,request_fingerprint,status,recipe,recipe_version,
  character_image_url,product_image_url,duration_seconds,ratio,audio,
  product_info,user_concept,caption,link,expected_credits,
  rights_confirmed,ai_disclosure_confirmed,max_attempts,qa_status,
  scheduled_at,created_at,updated_at
) VALUES (
  'runway-hoshilu-recommend-voice-20260818-v1',
  'hoshilu-runway-recommend-voice-20260818-v1',
  '3a834ad5f11e2b0ae2bbb0c908d75b26fcecf5e9d055b11a5154a2124123bd89',
  'APPROVED','product_ugc','2026-06',
  'https://hoshilu.app/social/runway/hoshilu-approved-model-reference-v1.jpg',
  'https://hoshilu.app/social/runway/hoshilu-product-screen-v1.jpg',
  8,'720:1280',1,
  'HOSHILU（ホシル）は、商品名が分からなくても、覚えている見た目・用途・見た場所などから、商品を探すための言葉を整理して検索を始められるサービスです。検索結果には楽天市場・Yahoo!ショッピングなど複数モールの商品が並び、送料込みの合計金額を確認できた商品はその金額で比較できます。価格、在庫、口コミ、ランキング、商品の性能は断定しません。',
  '明るい自然光のリビングで、許諾済みの女性がソファに座り、スマートフォンのHOSHILU検索画面を見ている。画面を少しカメラへ向けてから顔を上げ、日本語で「名前が分からない商品も、覚えている特徴で探せるよ。見つかった商品は、いろんなモールをまとめて比べられるの。」と友人に勧めるように自然な声で話し、最後に軽くうなずいて微笑む。架空のレビュー、価格、在庫、ランキング、商品の性能、無関係なブランドロゴを入れない。字幕や画面内文字は生成せず、後工程で正確に追加する。',
  '名前が分からなくても、覚えている特徴から探せる。見つかった商品は複数モールをまとめて比較。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成',
  'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_recommend_voice_20260818_v1',
  336,1,1,1,'PENDING',
  '2026-08-18T09:00:00.000Z','2026-08-18T09:00:00.000Z','2026-08-18T09:00:00.000Z'
);

INSERT OR IGNORE INTO runway_approval_grants (
  grant_id,job_id,granted_by,scope,granted_at
) VALUES (
  'runway-recommend-voice-approval-20260818-v1',
  'runway-hoshilu-recommend-voice-20260818-v1',
  'USER_EXPLICIT_2026-08-18',
  'MONTHLY_3000_CREDITS_GENERATION_ONLY_REVIEW_BEFORE_PUBLISH',
  '2026-08-18T09:00:00.000Z'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,event,detail,created_at
) VALUES (
  'runway-recommend-voice-job-approved-20260818-v1',
  'runway-hoshilu-recommend-voice-20260818-v1',
  'JOB_APPROVED',
  '{"expected_credits":336,"rights_confirmed":true,"ai_disclosure_confirmed":true,"external_publish":false,"approved_by":"USER_EXPLICIT_2026-08-18"}',
  '2026-08-18T09:00:00.000Z'
);
