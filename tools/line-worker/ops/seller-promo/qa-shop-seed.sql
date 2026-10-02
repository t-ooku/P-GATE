-- 2026-10-03 AI販促担当 OK① 後の本番確認用 QA 店舗（架空の店・架空の商品。店名・連絡先は入れない）。
-- 追加のみ・何度流しても同じ（ON CONFLICT DO NOTHING）。通知メールは空＝送らない。
-- 初回の無人実行をすぐ確かめるため、曜日・時刻は 土曜 04:00 JST（weekday=6, hour_jst=4）。
-- 確認後は管理 API（POST /api/admin/seller-promo/profiles）で weekday=1, hour_jst=6 に戻す。
INSERT INTO seller_promo_profiles(seller_key,display_name,plan,categories,ng_words,brand,publish_target,approval_mode,weekday,hour_jst,notify_email,pilot_id,qa,status,created_at,updated_at)
VALUES('qa-shop-1','QA雑貨店（検証用）','LIGHT','["生活雑貨"]','[]','{"color":"#1f6f5c","logo_asset_id":""}','NONE','MANUAL',6,4,'','',1,'ACTIVE','2026-10-03T00:00:00.000Z','2026-10-03T00:00:00.000Z')
ON CONFLICT(seller_key) DO NOTHING;
INSERT INTO seller_promo_products(id,seller_key,source,external_id,name,price_jpy,url,image_url,attrs,hash,imported_at,active) VALUES
('spp_qa000000000000000000000000000001','qa-shop-1','CSV','qa-box-1','玄関収納ボックス（検証用）',2980,'','','{"幅":"40cm","素材":"ポリプロピレン","色":"ホワイト"}','qa-seed-1','2026-10-03T00:00:00.000Z',1),
('spp_qa000000000000000000000000000002','qa-shop-1','CSV','qa-basket-1','持ち手つき収納かご（検証用）',1980,'','','{"幅":"30cm","素材":"綿","色":"ベージュ"}','qa-seed-2','2026-10-03T00:00:00.000Z',1),
('spp_qa000000000000000000000000000003','qa-shop-1','CSV','qa-hook-1','壁に貼れるフック（検証用）',880,'','','{"耐荷重":"1kg","色":"ブラック"}','qa-seed-3','2026-10-03T00:00:00.000Z',1)
ON CONFLICT(seller_key,source,external_id) DO NOTHING;
INSERT INTO seller_promo_questions(id,seller_key,source,product_ref,text,text_hash,weight,period_from,period_to,created_at) VALUES
('spq_qa000000000000000000000000000001','qa-shop-1','STORE_PASTE','qa-box-1','玄関の靴箱の横に置けるか知りたい','qa-seed-q1',3,'','','2026-10-03T00:00:00.000Z'),
('spq_qa000000000000000000000000000002','qa-shop-1','STORE_PASTE','qa-basket-1','洗えるかどうか知りたい','qa-seed-q2',2,'','','2026-10-03T00:00:00.000Z'),
('spq_qa000000000000000000000000000003','qa-shop-1','SUGGEST','','収納ボックス 玄関 おしゃれ','qa-seed-q3',1,'','','2026-10-03T00:00:00.000Z')
ON CONFLICT(seller_key,source,text_hash) DO NOTHING;
