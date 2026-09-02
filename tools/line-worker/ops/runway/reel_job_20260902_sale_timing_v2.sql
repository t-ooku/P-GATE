-- AI女優リール(9月セール準備編)の作り直し(v2)。2026-09-02 22:30 大隆さんのQA:
-- v1は「手に持ったスマホが途中で消える」「サービス名を『ホスル』と誤発音」で
-- 不合格(Instagramはキュー取り消し、Xは所有者が削除)。
-- v2の対策: 小道具なし(両手に何も持たない)、セリフは一字一句固定、固有名詞・
-- サービス名は発話させない。レシピ・費用・参照画像はv1と同じ(336クレジット)。
-- request_fingerprint は job_id と user_concept の SHA-256(重複投入防止)。
INSERT OR IGNORE INTO runway_generation_jobs (
  job_id,post_id,request_fingerprint,status,recipe,recipe_version,
  character_image_url,product_image_url,duration_seconds,ratio,audio,
  product_info,user_concept,caption,link,expected_credits,
  rights_confirmed,ai_disclosure_confirmed,max_attempts,qa_status,
  scheduled_at,created_at,updated_at
) VALUES (
  'runway-hoshilu-sale-timing-20260902-v2',
  'hoshilu-runway-sale-timing-20260902-v2',
  '9f47013e278448151db73066c32264edcf416263838e2fc518fadd82b91254fe',
  'APPROVED','product_ugc','2026-06',
  'https://hoshilu.app/social/runway/hoshilu-approved-model-reference-v2.jpg',
  'https://hoshilu.app/social/runway/hoshilu-product-screen-v1.jpg',
  8,'720:1280',1,
  'HOSHILU（ホシル）は、商品名が分からなくても、覚えている見た目・用途・写真から、商品を探すための言葉を整理して検索を始められるサービスです。9月はQoo10メガ割・楽天スーパーSALE・Yahoo!ショッピングのポイントデーなどセールが続く時期で、HOSHILUのセール特集では各モールのセール時期の確認方法と、事前に欲しい商品の名前を決めておく準備のしかたを案内しています。検索結果には楽天市場・Yahoo!ショッピングなど複数モールの商品が並びます。価格、在庫、割引率、口コミ、ランキング、商品の性能は断定しません。',
  '明るい自然光のキッチンで、許諾済みの若い女性が両手に何も持たず、カメラの方を向いて立っている。小道具は一切なし(スマートフォンや商品も持たない)。日本語で、次のセリフだけを一字一句そのまま、余計な言葉やサービス名を足さずに話す:「9月はセールが続くから、先に欲しい物の名前を決めておくと迷わないよ。写真を撮るだけでも探せるの。」友人に話すように自然な声で、最後に小さくうなずいて微笑む。表情は明るく、テンポは軽快に。固有名詞・ブランド名・サービス名は発話しない。架空のレビュー、価格、在庫、ランキング、割引率、商品の性能、無関係なブランドロゴを入れない。画面内の文字・UI・字幕・テロップは一切生成しない(字幕と実画面は後工程で正確に追加する)。',
  '9月はセールが続く月。先に「欲しい物の名前」を決めておくと迷わない。名前が分からなくても、写真を撮るだけで探せます。セール時期の確認と準備のしかたは、プロフィールのリンクから。※この動画はAI生成・AI加工映像です。 #Qoo10メガ割 #楽天スーパーSALE #セール準備 #HOSHILU',
  'https://hoshilu.app/ja/plan-shopping-with-ec-sale-calendar?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_reel&utm_content=runway_sale_timing_20260902_v2',
  336,1,1,1,'PENDING',
  '2026-09-02T13:35:00.000Z','2026-09-02T13:35:00.000Z','2026-09-02T13:35:00.000Z'
);

INSERT OR IGNORE INTO runway_approval_grants (
  grant_id,job_id,granted_by,scope,granted_at
) VALUES (
  'runway-sale-timing-approval-20260902-v2',
  'runway-hoshilu-sale-timing-20260902-v2',
  'USER_EXPLICIT_2026-09-02',
  'MONTHLY_6000_CREDITS_GENERATION_ONLY_REVIEW_BEFORE_PUBLISH',
  '2026-09-02T13:35:00.000Z'
);

INSERT OR IGNORE INTO runway_audit_log (
  audit_id,job_id,event,detail,created_at
) VALUES (
  'runway-sale-timing-job-approved-20260902-v2',
  'runway-hoshilu-sale-timing-20260902-v2',
  'JOB_APPROVED',
  '{"expected_credits":336,"rights_confirmed":true,"ai_disclosure_confirmed":true,"external_publish":false,"approved_by":"USER_EXPLICIT_2026-09-02","persona":"hoshilu-approved-model-reference-v2","audience":"10-30s","structure":"cut_a_only_no_props","retry_of":"runway-hoshilu-sale-timing-20260902-v1","retry_reason":"owner QA: phone prop vanished mid-clip and brand name mispronounced. v2 removes props and pins the spoken line","theme":"september_sale_preparation","landing":"/ja/plan-shopping-with-ec-sale-calendar"}',
  '2026-09-02T13:35:00.000Z'
);
