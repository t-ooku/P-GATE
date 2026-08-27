-- AI女優リール第4弾: 「昔買ったあの商品、名前を忘れても探せる」(中年層向け)。
--
-- 2ペルソナ並行運用(大隆さん指示 2026-08-19)の中年層ライン第1弾:
--   - 参照画像は既存の hoshilu-approved-model-reference-v1.jpg (落ち着いた
--     雰囲気の女優)。30〜50代のAmazon・楽天利用層がターゲット。
--   - 口調は丁寧で親しみのある大人向け。若者向け(v2ライン)とは分ける。
--   - 第3弾と同じ2カット構成(カットAのみ生成、スマホ画面は映さない)。
--
-- 注意: 生成パイプラインは1本ずつ直列で動く。第3弾がGENERATED_REVIEW_REQUIRED
-- の間、このジョブはAPPROVEDのまま待機し、第3弾のQA承認後に自動で生成が始まる
-- (これは設計どおりの動き)。
--
-- 予算: 8秒 720:1280 = 336クレジット。月間上限6,000の範囲内(見込み使用 1,344/6,000)。
INSERT OR IGNORE INTO runway_generation_jobs (
  job_id,post_id,request_fingerprint,status,recipe,recipe_version,
  character_image_url,product_image_url,duration_seconds,ratio,audio,
  product_info,user_concept,caption,link,expected_credits,
  rights_confirmed,ai_disclosure_confirmed,max_attempts,qa_status,
  scheduled_at,created_at,updated_at
) VALUES (
  'runway-hoshilu-name-forgotten-20260819-v1',
  'hoshilu-runway-name-forgotten-20260819-v1',
  '36806e1c602d04b024e7b30ba24cba0bb5e1d7ebd98dedfcd442aa9d98f0ec89',
  'APPROVED','product_ugc','2026-06',
  'https://hoshilu.app/social/runway/hoshilu-approved-model-reference-v1.jpg',
  'https://hoshilu.app/social/runway/hoshilu-product-screen-v1.jpg',
  8,'720:1280',1,
  'HOSHILU（ホシル）は、商品名が分からなくても、覚えている見た目・用途・見た場所などから、商品を探すための言葉を整理して検索を始められるサービスです。昔使っていた商品や買い直したい商品も、覚えている特徴を入力すれば、楽天市場・Yahoo!ショッピングなど複数モールの商品候補から探せます。送料込みの合計金額を確認できた商品はその金額で比較できます。価格、在庫、口コミ、ランキング、商品の性能は断定しません。',
  '明るい自然光のリビングで、許諾済みの落ち着いた雰囲気の大人の女性(30代)がソファに座り、スマートフォンを片手に持っている。スマートフォンは背面をカメラへ向けるか手元に伏せたままにし、画面は一度もカメラへ向けない。顔を上げて、日本語で「昔使っていたあの商品、名前を忘れても大丈夫。覚えている特徴から探せますよ。」と丁寧で親しみのある口調で話し、最後に軽くうなずいて微笑む。架空のレビュー、価格、在庫、ランキング、商品の性能、無関係なブランドロゴを入れない。画面内の文字・UI・字幕・テロップは一切生成しない（字幕と実画面は後工程で正確に追加する）。',
  'Qoo10やSHEINで見たのに、商品名を忘れた。覚えている色・形・使い方を話すだけ。AIが特徴を理解し、HOSHILUが商品を探します。※この動画はAI生成・AI加工映像です。 #Qoo10購入品 #SHEIN購入品',
  'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_name_forgotten_20260819_v1',
  336,1,1,1,'PENDING',
  '2026-08-19T06:00:00.000Z','2026-08-19T06:00:00.000Z','2026-08-19T06:00:00.000Z'
);

INSERT OR IGNORE INTO runway_approval_grants (
  grant_id,job_id,granted_by,scope,granted_at
) VALUES (
  'runway-name-forgotten-approval-20260819-v1',
  'runway-hoshilu-name-forgotten-20260819-v1',
  'USER_EXPLICIT_2026-08-19',
  'MONTHLY_6000_CREDITS_GENERATION_ONLY_REVIEW_BEFORE_PUBLISH',
  '2026-08-19T06:00:00.000Z'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,event,detail,created_at
) VALUES (
  'runway-name-forgotten-job-approved-20260819-v1',
  'runway-hoshilu-name-forgotten-20260819-v1',
  'JOB_APPROVED',
  '{"expected_credits":336,"rights_confirmed":true,"ai_disclosure_confirmed":true,"external_publish":false,"approved_by":"USER_EXPLICIT_2026-08-19","persona":"hoshilu-approved-model-reference-v1","audience":"30-50s","structure":"cut_a_only_no_screen_shown"}',
  '2026-08-19T06:00:00.000Z'
);
