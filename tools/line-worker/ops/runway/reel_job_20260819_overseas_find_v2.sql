-- AI女優リール第3弾の再投入(v2)。
--
-- 初回投入(reel_job_20260819_overseas_find_v1.sql)は、参照画像
-- hoshilu-approved-model-reference-v2.jpg が本番未配信(リモートに紛れ込んだ
-- 旧テストファイルがCIを落とし、デプロイが止まっていた)のタイミングで
-- cronに拾われ、RUNWAY_PRODUCT_UGC_CREATE_HTTP_400 で FAILED_FINAL となった
-- (課金なし・クレジット未消費)。max_attempts=1 の設計どおり、修正後は
-- 新しいジョブとして投入し直す。
--
-- request_fingerprint はテーブル全体でUNIQUEのため、user_conceptへ表情の
-- 指示を1文追加して差別化している(内容は同一趣旨)。
--
-- ※実行はデプロイ復旧後、参照画像URLがブラウザで表示されることを確認してから。
INSERT OR IGNORE INTO runway_generation_jobs (
  job_id,post_id,request_fingerprint,status,recipe,recipe_version,
  character_image_url,product_image_url,duration_seconds,ratio,audio,
  product_info,user_concept,caption,link,expected_credits,
  rights_confirmed,ai_disclosure_confirmed,max_attempts,qa_status,
  scheduled_at,created_at,updated_at
) VALUES (
  'runway-hoshilu-overseas-find-20260819-v2',
  'hoshilu-runway-overseas-find-20260819-v2',
  'c9ae1d7e1752d0b9a3731db8579a142106bd8a3a9b7ef6cae8a1728a212c02bb',
  'APPROVED','product_ugc','2026-06',
  'https://hoshilu.app/social/runway/hoshilu-approved-model-reference-v2.jpg',
  'https://hoshilu.app/social/runway/hoshilu-product-screen-v1.jpg',
  8,'720:1280',1,
  'HOSHILU（ホシル）は、商品名が分からなくても、覚えている見た目・用途・見た場所などから、商品を探すための言葉を整理して検索を始められるサービスです。海外で見かけた商品でも、覚えている特徴を日本語で入力すれば、日本の複数モールで同じ条件の商品を探せます。検索結果には楽天市場・Yahoo!ショッピングなど複数モールの商品が並びます。価格、在庫、口コミ、ランキング、商品の性能は断定しません。',
  '明るい自然光のリビングで、許諾済みの若い女性がソファに座り、スマートフォンを片手に持っている。スマートフォンは背面をカメラへ向けるか手元に伏せたままにし、画面は一度もカメラへ向けない。顔を上げて、日本語で「海外で見かけたあの商品、日本でも探せるよ。覚えてる特徴を話すだけでいいの。」と友人に勧めるように自然な声で話し、最後に軽くうなずいて微笑む。表情は柔らかく親しみやすく。架空のレビュー、価格、在庫、ランキング、商品の性能、無関係なブランドロゴを入れない。画面内の文字・UI・字幕・テロップは一切生成しない（字幕と実画面は後工程で正確に追加する）。',
  '海外やQoo10・SHEINで見かけた「あれ」、日本でも探せる。覚えている特徴を話すだけ。AIが理解し、HOSHILUが探します。※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #海外通販',
  'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_overseas_find_20260819_v1',
  336,1,1,1,'PENDING',
  '2026-08-19T06:30:00.000Z','2026-08-19T06:30:00.000Z','2026-08-19T06:30:00.000Z'
);

INSERT OR IGNORE INTO runway_approval_grants (
  grant_id,job_id,granted_by,scope,granted_at
) VALUES (
  'runway-overseas-find-approval-20260819-v2',
  'runway-hoshilu-overseas-find-20260819-v2',
  'USER_EXPLICIT_2026-08-19',
  'MONTHLY_6000_CREDITS_GENERATION_ONLY_REVIEW_BEFORE_PUBLISH',
  '2026-08-19T06:30:00.000Z'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,event,detail,created_at
) VALUES (
  'runway-overseas-find-job-approved-20260819-v2',
  'runway-hoshilu-overseas-find-20260819-v2',
  'JOB_APPROVED',
  '{"expected_credits":336,"rights_confirmed":true,"ai_disclosure_confirmed":true,"external_publish":false,"approved_by":"USER_EXPLICIT_2026-08-19","persona":"hoshilu-approved-model-reference-v2","audience":"10-20s","structure":"cut_a_only_no_screen_shown","retry_of":"runway-hoshilu-overseas-find-20260819-v1","retry_reason":"character image 404 at submit time (deploy was blocked by a stale test file) - no credits were charged"}',
  '2026-08-19T06:30:00.000Z'
);
