-- User approval: promote the shipped "keep looking until found" experience.
-- Text-only posts are queued only for connected text-capable channels.
INSERT OR IGNORE INTO social_post_queue
(post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,affiliate,approved_at,created_at,updated_at)
VALUES
('hoshilu_continuous_search_x_20260829','X','continuous_search_launch_2026_08','keep_looking_x_01',
 '検索は、1回で終わらない。「SNSで見た、名前の分からないあれ」をHOSHILUに預けると、条件に合う新しい実在商品が見つかるまで探し続けます。見つかったときだけ通知。無料会員で使えます。 #ホシル #あいまい検索 #これホシっといて',
 'https://hoshilu.app/?utm_source=x&utm_medium=organic_social&utm_campaign=continuous_search_launch_2026_08&utm_content=keep_looking_x_01',
 '', '2026-08-29T03:15:00.000Z','APPROVED',0,'2026-08-28T15:00:00.000Z','2026-08-28T15:00:00.000Z','2026-08-28T15:00:00.000Z'),
('hoshilu_continuous_search_threads_20260829','THREADS','continuous_search_launch_2026_08','keep_looking_threads_01',
 '「今は見つからない」を、検索の終わりにしない。HOSHILUに条件を預けると、新しく一致する実在商品が見つかるまで探し続けます。余計な通知はせず、見つかったときだけ。 #ホシル #これホシっといて',
 'https://hoshilu.app/?utm_source=threads&utm_medium=organic_social&utm_campaign=continuous_search_launch_2026_08&utm_content=keep_looking_threads_01',
 '', '2026-08-29T11:00:00.000Z','APPROVED',0,'2026-08-28T15:00:00.000Z','2026-08-28T15:00:00.000Z','2026-08-28T15:00:00.000Z');
