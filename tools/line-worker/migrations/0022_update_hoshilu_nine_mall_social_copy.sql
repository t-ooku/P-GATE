UPDATE social_post_queue
SET caption=CASE post_id
  WHEN 'hoshilu_feature_001' THEN '9つのショッピングモールに対応。Amazon・楽天市場・Qoo10・SHEIN・ZOZOTOWN・SHOPLIST・MUSINSA・BUYMA・SNKRDUNK。名前が曖昧でも、覚えている特徴から探せます。 #ホシル #9モール横断'
  WHEN 'hoshilu_feature_009' THEN '9つのショッピングモールから探せる。商品名が分からなくても、色・形・系統など、覚えている特徴をホシルへ。 #ホシル #Amazon #楽天市場 #Qoo10 #SHEIN #ZOZOTOWN #SHOPLIST #MUSINSA #BUYMA #SNKRDUNK'
  WHEN 'hoshilu_feature_011' THEN '対応するショッピングモールは9つ。Amazon・楽天市場・Qoo10・SHEIN・ZOZOTOWN・SHOPLIST・MUSINSA・BUYMA・SNKRDUNKから探せます。 #ホシル #9モール横断'
END,
updated_at='2026-08-01T04:56:00.000Z'
WHERE post_id IN ('hoshilu_feature_001','hoshilu_feature_009','hoshilu_feature_011')
  AND status='APPROVED';
