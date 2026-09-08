UPDATE social_post_queue
SET status='CANCELLED', last_error='CANCELLED_OUTDATED_MARKETPLACE_COPY', updated_at='2026-08-02T00:30:00.000Z'
WHERE post_id IN ('hoshilu_feature_009','hoshilu_feature_011','hoshilu_reel_ambiguous_01','cadence-20260812-ig')
  AND status IN ('APPROVED','REVIEW_REQUIRED','FAILED');

UPDATE social_post_queue
SET caption=REPLACE(REPLACE(REPLACE(caption,'ほしっトク','ほしっとく'),'#4モール横断','#10モール横断'),'#9モール横断','#10モール横断'),
    updated_at='2026-08-02T00:30:00.000Z'
WHERE status='REVIEW_REQUIRED';

UPDATE social_post_queue SET caption=
  CASE post_id
    WHEN 'hoshilu_social_cross_search_x_01' THEN '「動画で見た、名前が分からないあれ」を、そのまま入力。HOSHILUが曖昧な記憶を検索語に整え、主要5モール（ファッション検索は最大10モール）とInstagram・X・TikTok・YouTubeへ同じ条件で探しに行けます。リンク先で動画・画像・投稿を楽しもう。 #ホシル #あいまい検索 #SNS検索'
    WHEN 'hoshilu_social_cross_search_ig_01' THEN '名前を忘れても、見た目や使い方は覚えてる。HOSHILUに記憶の断片を入れると検索語に整理。主要5モール（ファッション検索は最大10モール）とInstagram・X・TikTok・YouTubeへ同じ条件で探しに行けます。各SNSのリンク先で動画・画像・投稿を楽しんでね。 #ホシル #あいまい検索 #SNS検索 #Instagram検索 #TikTok検索 #YouTube検索 #X検索 #10モール横断'
    WHEN 'hoshilu_social_cross_search_video_01' THEN '名前が分からない「動画で見たあれ」も、覚えている特徴から。HOSHILUが曖昧な記憶を検索語に整え、主要5モール（ファッション検索は最大10モール）とInstagram・X・TikTok・YouTubeへ同じ条件で探しに行けます。リンク先で動画・画像・投稿をチェック。 #ホシル #あいまい検索 #SNS検索 #TikTok検索 #Instagram検索 #YouTube検索 #10モール横断'
    ELSE caption
  END,
  updated_at='2026-08-02T00:30:00.000Z'
WHERE campaign_id='social_cross_search_2026_08' AND status='REVIEW_REQUIRED';

INSERT OR IGNORE INTO social_post_queue
(post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,affiliate,approved_at,created_at,updated_at)
VALUES
('hoshilu_marketplace_10_refresh_x_01','X','marketplace_10_refresh_2026_08','marketplace_10_refresh_x_01',
 '主要5モールはAmazon・楽天市場・Yahoo!ショッピング・Qoo10・SHEIN。ファッション検索ではZOZOTOWN・SHOPLIST・MUSINSA・BUYMA・SNKRDUNKを追加し、最大10モールから探せます。 #ホシル #10モール横断',
 'https://hoshilu.app/?q=白%20厚底%20レトロ%20スニーカー&utm_source=x&utm_medium=organic_social&utm_campaign=marketplace_10_refresh_2026_08&utm_content=x_01',
 '', '2026-12-31T14:59:00.000Z','REVIEW_REQUIRED',0,'','2026-08-02T00:30:00.000Z','2026-08-02T00:30:00.000Z'),
('hoshilu_ambiguous_10_refresh_ig_01','INSTAGRAM','marketplace_10_refresh_2026_08','ambiguous_10_refresh_ig_01',
 '名前が分からなくても、色・形・使い方をそのまま入力。主要5モール、ファッションなら最大10モールへ同じ検索条件で探しに行けます。あとで探すなら、ほしっとく。 #ホシル #あいまい検索 #ほしっとく #10モール横断',
 'https://hoshilu.app/?q=歩くとソールが光るスニーカー&utm_source=instagram&utm_medium=organic_social&utm_campaign=marketplace_10_refresh_2026_08&utm_content=ig_01',
 '', '2026-12-31T14:59:00.000Z','REVIEW_REQUIRED',0,'','2026-08-02T00:30:00.000Z','2026-08-02T00:30:00.000Z');
