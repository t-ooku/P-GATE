-- User-approved Runway API test: maximum initial budget 1,000 credits and
-- monthly budget 3,000 credits. This inserts no Secret and is idempotent.
INSERT OR IGNORE INTO runway_generation_jobs (
  job_id,post_id,request_fingerprint,status,recipe,recipe_version,
  character_image_url,product_image_url,duration_seconds,ratio,audio,
  product_info,user_concept,caption,link,expected_credits,
  rights_confirmed,ai_disclosure_confirmed,max_attempts,qa_status,
  scheduled_at,created_at,updated_at
) VALUES (
  'runway-hoshilu-model-ugc-test-20260813-v1',
  'hoshilu-runway-model-ugc-20260813-v1',
  'c93f00332ed1dce7631663a67be340eb484de1c2c374deacceedbd783c34a3e1',
  'APPROVED','product_ugc','2026-06',
  'https://hoshilu.app/social/runway/hoshilu-approved-model-reference-v1.jpg',
  'https://hoshilu.app/social/runway/hoshilu-product-screen-v1.jpg',
  8,'720:1280',1,
  'HOSHILU（ホシル）は、商品名が分からなくても、覚えている見た目・用途・見た場所などから、商品を探すための言葉を整理して検索を始められるサービスです。価格、在庫、口コミ、ランキング、商品の性能は断定しません。',
  '明るい自然光の部屋で、許諾済みの女性がスマートフォンのHOSHILU画面を見てからカメラへ微笑み、日本語で「名前が分からなくても、欲しいものは探せる。HOSHILUで探してみよう。」と自然に話す。架空のレビュー、価格、在庫、ランキング、商品の性能、無関係なブランドロゴを入れない。字幕や画面内文字は生成せず、後工程で正確に追加する。',
  '商品名が分からなくても、覚えている見た目や使い方から探せる言葉へ。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成',
  'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_test&utm_content=runway_product_ugc_test_20260813_v1',
  336,1,1,1,'PENDING',
  '2026-08-13T08:00:00.000Z','2026-08-13T08:00:00.000Z','2026-08-13T08:00:00.000Z'
);

INSERT OR IGNORE INTO runway_approval_grants (
  grant_id,job_id,granted_by,scope,granted_at
) VALUES (
  'runway-initial-test-approval-20260813-v1',
  'runway-hoshilu-model-ugc-test-20260813-v1',
  'USER_EXPLICIT_2026-08-13',
  'INITIAL_1000_CREDITS_MONTHLY_3000_CREDITS',
  '2026-08-13T08:00:00.000Z'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,event,detail,created_at
) VALUES (
  'runway-initial-test-job-approved-20260813-v1',
  'runway-hoshilu-model-ugc-test-20260813-v1',
  'JOB_APPROVED',
  '{"expected_credits":336,"rights_confirmed":true,"ai_disclosure_confirmed":true,"external_publish":false}',
  '2026-08-13T08:00:00.000Z'
);
