-- AI女優リール第3弾: 「海外で見た商品を日本で探す」を女優の声で案内する。
--
-- 第3弾からの変更点(大隆さん承認 2026-08-19):
--   1. 参照画像を hoshilu-approved-model-reference-v2.jpg (22歳想定・候補6枚
--      から大隆さんが選定、権利台帳 hoshilu_model_reference_v2)へ変更。
--      以後この顔が identity_consistent の基準。
--   2. 2カット構成へ変更。この生成はカットA(女優が話す8秒)のみで、
--      スマートフォンの画面は一度もカメラへ向けない(伏せる/背面を見せる)。
--      カットB(hoshilu.appの実画面録画)と字幕は後工程で追加する。
--      これにより第1弾・第2弾で発生した「架空のHOSHILU画面の生成」を
--      構造的に排除する。
--
-- 予算: 8秒 720:1280 = 336クレジット(calculateProductUgcCreditsと一致必須)。
-- 月間上限6,000の範囲内(既使用672+336=1008)。
--
-- このINSERTは生成までを承認する。生成後は GENERATED_REVIEW_REQUIRED で
-- 停止し、QA承認なしにInstagramへは公開されない(既存ガバナンスのまま)。
INSERT OR IGNORE INTO runway_generation_jobs (
  job_id,post_id,request_fingerprint,status,recipe,recipe_version,
  character_image_url,product_image_url,duration_seconds,ratio,audio,
  product_info,user_concept,caption,link,expected_credits,
  rights_confirmed,ai_disclosure_confirmed,max_attempts,qa_status,
  scheduled_at,created_at,updated_at
) VALUES (
  'runway-hoshilu-overseas-find-20260819-v1',
  'hoshilu-runway-overseas-find-20260819-v1',
  'e13c94cd3fe49a182dcfca66d75d84b09cb880a52a0627260108f513fb2d9b67',
  'APPROVED','product_ugc','2026-06',
  'https://hoshilu.app/social/runway/hoshilu-approved-model-reference-v2.jpg',
  'https://hoshilu.app/social/runway/hoshilu-product-screen-v1.jpg',
  8,'720:1280',1,
  'HOSHILU（ホシル）は、商品名が分からなくても、覚えている見た目・用途・見た場所などから、商品を探すための言葉を整理して検索を始められるサービスです。海外で見かけた商品でも、覚えている特徴を日本語で入力すれば、日本の複数モールで同じ条件の商品を探せます。検索結果には楽天市場・Yahoo!ショッピングなど複数モールの商品が並びます。価格、在庫、口コミ、ランキング、商品の性能は断定しません。',
  '明るい自然光のリビングで、許諾済みの女性がソファに座り、スマートフォンを片手に持っている。スマートフォンは背面をカメラへ向けるか手元に伏せたままにし、画面は一度もカメラへ向けない。顔を上げて、日本語で「海外で見かけたあの商品、日本でも探せるよ。覚えてる特徴を話すだけでいいの。」と友人に勧めるように自然な声で話し、最後に軽くうなずいて微笑む。架空のレビュー、価格、在庫、ランキング、商品の性能、無関係なブランドロゴを入れない。画面内の文字・UI・字幕・テロップは一切生成しない（字幕と実画面は後工程で正確に追加する）。',
  '海外で見かけたあの商品、日本でも探せる。覚えている特徴を話すだけ。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。※この動画はAI生成・AI加工映像です。 #ホシル #あいまい検索 #AI生成',
  'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_overseas_find_20260819_v1',
  336,1,1,1,'PENDING',
  '2026-08-19T12:00:00.000Z','2026-08-19T12:00:00.000Z','2026-08-19T12:00:00.000Z'
);

INSERT OR IGNORE INTO runway_approval_grants (
  grant_id,job_id,granted_by,scope,granted_at
) VALUES (
  'runway-overseas-find-approval-20260819-v1',
  'runway-hoshilu-overseas-find-20260819-v1',
  'USER_EXPLICIT_2026-08-19',
  'MONTHLY_6000_CREDITS_GENERATION_ONLY_REVIEW_BEFORE_PUBLISH',
  '2026-08-19T12:00:00.000Z'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,event,detail,created_at
) VALUES (
  'runway-overseas-find-job-approved-20260819-v1',
  'runway-hoshilu-overseas-find-20260819-v1',
  'JOB_APPROVED',
  '{"expected_credits":336,"rights_confirmed":true,"ai_disclosure_confirmed":true,"external_publish":false,"approved_by":"USER_EXPLICIT_2026-08-19","persona":"hoshilu-approved-model-reference-v2","structure":"cut_a_only_no_screen_shown"}',
  '2026-08-19T12:00:00.000Z'
);
