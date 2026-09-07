import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import {
  brandToken, identityTokens, modelCodeTokens, observationReason, purgeTargetPriceObservations,
  runTargetPriceScan, sameProduct
} from '../src/target-price-watch.mjs';

globalThis.crypto??=cryptoModule.webcrypto;

function envWithDb(){
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['0002_member_wishes.sql','0003_member_wish_preferences.sql','0005_mywatch_notifications.sql','0031_member_notification_destinations.sql','0036_mywatch_notification_product_fields.sql','0044_insight_search_watch.sql','0076_target_price_observations.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  const db={prepare(sql){const statement=sqlite.prepare(sql);return{bind(...values){return{run:async()=>{const result=statement.run(...values);return{meta:{changes:Number(result.changes||0)}};},first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)})};}};},batch:async(statements)=>Promise.all(statements.map(statement=>statement.run()))};
  return{sqlite,env:{PRODUCT_DB:db,YAHOO_SHOPPING_CLIENT_ID:'client-id'}};
}

function yahooFetch(price=2800){return async()=>new Response(JSON.stringify({hits:[{name:'LILMOON リルムーン ワンデー 度あり カラコン',code:'lilmoon-1',url:'https://store.shopping.yahoo.co.jp/shop/lilmoon-1.html',price,shipping:{code:2},exImage:{url:'https://item-shopping.c.yimg.jp/i/l/lilmoon.jpg'}}]}),{status:200,headers:{'content-type':'application/json'}});}

test('API確認価格が購入希望額以下になった時だけ一度通知し、同じ状態では重複しない',async()=>{
  const {sqlite,env}=envWithDb();const now='2026-08-10T00:00:00.000Z';
  sqlite.prepare(`INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at)
    VALUES('m1','w1','カラコン ローラ 度入り','JA',0,1,0,0,'INSTANT',0,?1,?2,?2)`).run(JSON.stringify({price_condition:{target_price_jpy:3000,target_product_key:'YAHOO:lilmoon-1',target_product_name:'LILMOON リルムーン 度あり カラコン'}}),now);
  sqlite.prepare("INSERT INTO member_notification_destinations VALUES('m1','EMAIL','encrypted','2026-08-09','2026-08-09')").run();
  const first=await runTargetPriceScan(env,now,yahooFetch(2800));
  assert.deepEqual(first,{scanned:1,notifications_sent:1});
  const notification=sqlite.prepare("SELECT title,body,marketplace FROM mywatch_notifications WHERE channel='WEB'").get();
  assert.equal(notification.title,'購入したい価格になりました');
  assert.match(notification.body,/¥2,800/);assert.equal(notification.marketplace,'YAHOO_JP');
  const second=await runTargetPriceScan(env,'2026-08-10T04:00:00.000Z',yahooFetch(2700));
  assert.deepEqual(second,{scanned:1,notifications_sent:0});
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM mywatch_notifications').get().count,2);
  assert.equal(sqlite.prepare("SELECT status FROM mywatch_notifications WHERE channel='EMAIL'").get().status,'PENDING');
  const rearmed=await runTargetPriceScan(env,'2026-08-10T08:00:00.000Z',yahooFetch(3400));
  assert.deepEqual(rearmed,{scanned:1,notifications_sent:0});
  const reachedAgain=await runTargetPriceScan(env,'2026-08-10T12:00:00.000Z',yahooFetch(2600));
  assert.deepEqual(reachedAgain,{scanned:1,notifications_sent:1});
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM mywatch_notifications').get().count,4);
});

test('希望額より高いAPI価格では通知せず、AI推定価格用の入力経路を持たない',async()=>{
  const {sqlite,env}=envWithDb();const now='2026-08-10T00:00:00.000Z';
  sqlite.prepare(`INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at)
    VALUES('m1','w1','LILMOON','JA',0,1,0,0,'INSTANT',0,?1,?2,?2)`).run(JSON.stringify({price_condition:{target_price_jpy:2500,target_product_name:'LILMOON リルムーン'}}),now);
  const result=await runTargetPriceScan(env,now,yahooFetch(2800));
  assert.deepEqual(result,{scanned:1,notifications_sent:0});
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM mywatch_notifications').get().count,0);
  assert.ok(sqlite.prepare("SELECT matched_at FROM search_watch_matches WHERE wish_id='w1' AND product_identity_key='TARGET_PRICE_CHECK'").get().matched_at);
});

// 2026-09-05 夜 大隆さん決定「逆ウォッチ」
test('逆ウォッチは買った価格より安い時に「買った後に値下がりしました」で通知し、30日を過ぎた設定は走査しない',async()=>{
  const {sqlite,env}=envWithDb();const now='2026-09-05T12:00:00.000Z';
  const insert=sqlite.prepare(`INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at)
    VALUES(?1,?2,?3,'JA',0,1,0,0,'INSTANT',0,?4,?5,?5)`);
  insert.run('m1','w-post','LILMOON リルムーン ワンデー 度あり カラコン',JSON.stringify({price_condition:{kind:'POST_PURCHASE',purchase_price_jpy:3000,target_price_jpy:2999,expires_at:'2026-10-05T12:00:00.000Z',target_product_key:'YAHOO:lilmoon-1',target_product_name:'LILMOON リルムーン 度あり カラコン'}}),'2026-09-05T00:00:00.000Z');
  insert.run('m2','w-expired','LILMOON リルムーン ワンデー 度あり カラコン',JSON.stringify({price_condition:{kind:'POST_PURCHASE',purchase_price_jpy:3000,target_price_jpy:2999,expires_at:'2026-09-01T00:00:00.000Z',target_product_key:'YAHOO:lilmoon-1',target_product_name:'LILMOON リルムーン 度あり カラコン'}}),'2026-08-01T00:00:00.000Z');
  const same=await runTargetPriceScan(env,now,yahooFetch(3000));
  assert.deepEqual(same,{scanned:1,notifications_sent:0});
  const cheaper=await runTargetPriceScan(env,'2026-09-05T16:00:00.000Z',yahooFetch(2800));
  assert.deepEqual(cheaper,{scanned:1,notifications_sent:1});
  const notification=sqlite.prepare("SELECT wish_id,title,body FROM mywatch_notifications WHERE channel='WEB'").get();
  assert.equal(notification.wish_id,'w-post');
  assert.equal(notification.title,'買った後に値下がりしました');
  assert.match(notification.body,/¥2,800/);assert.match(notification.body,/買った価格 ¥3,000より安い/);
});

// 2026-09-07: 本番の3件を実データで確かめたところ、保存されている商品名の先頭は
// キャンペーン文で埋まっていて、型番もブランドも判定に使われていなかった。
// 「バッグ・レディース・トートバッグ」の3語一致で別ブランドの鞄が同一商品と
// 判定される状態だった。別商品の値段で「希望価格になりました」と通知するのは、
// 通知しないことより悪い。
const BAG='【8/16 23:59まで まとめ買いクーポン3点以上で 10%OFF 】 java ジャバ バッグ レディース ミニ トートバッグ アウトドア 巾着 メッシュ bag 2WAY 軽量 ショルダー ハンドバッグ シンプル メンズ ユニセックス 大容量 軽量 春 秋 冬 2024 クラシカルエルフ jv1159001';

test('判定に使う語は、キャンペーン文を捨てて型番とブランドを拾う', () => {
  const words = identityTokens(BAG);
  assert.ok(words.includes('java'));
  assert.ok(words.includes('トートバッグ'));
  // 「8/16 23:59まで」「まとめ買いクーポン3点以上で」「10%OFF」は判定に使わない
  assert.ok(!words.includes('16'));
  assert.ok(!words.includes('59まで'));
  assert.ok(!words.some((word) => word.includes('クーポン')));
  assert.ok(!words.includes('off'));
  assert.equal(brandToken(words), 'java');
  // 型番は商品名の末尾にあっても拾う
  assert.deepEqual(modelCodeTokens(['java', 'jv1159001', 'バッグ']), ['jv1159001']);
});

test('別ブランドの似た商品は同一商品と判定しない（誤通知を出さない）', () => {
  const wish = { target_product_key: '', target_product_name: BAG };
  assert.equal(sameProduct(wish, { display_name: '全く別のブランド レディース トートバッグ 大容量 軽量 通勤 A4 2024新作' }), false);
  // 型番が一致すれば、それだけで同一商品と見なせる
  assert.equal(sameProduct(wish, { display_name: 'java ジャバ バッグ jv1159001 レディース' }), true);
  // 同じ出品（語もほぼそのまま）は一致する
  assert.equal(sameProduct(wish, { display_name: 'java ジャバ バッグ レディース ミニ トートバッグ アウトドア 巾着 メッシュ bag 2WAY 軽量 ショルダー' }), true);
  // モールIDが保存されていれば、それが最優先
  assert.equal(sameProduct({ target_product_key: 'YAHOO:x1', target_product_name: BAG }, { record_key: 'YAHOO:x1', display_name: '関係ない名前' }), true);
});

test('巡回の結果（いくらだったか・見つけられたか）を残す', async () => {
  const { sqlite, env } = envWithDb(); const now = '2026-09-07T00:00:00.000Z';
  sqlite.prepare(`INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at)
    VALUES('m1','w1','LILMOON','JA',0,1,0,0,'INSTANT',0,?1,?2,?2)`)
    .run(JSON.stringify({ price_condition: { target_price_jpy: 2500, target_product_key: 'YAHOO:lilmoon-1', target_product_name: 'LILMOON リルムーン 度あり カラコン' } }), now);
  await runTargetPriceScan(env, now, yahooFetch(2800));
  const row = sqlite.prepare('SELECT * FROM target_price_observations WHERE wish_id=?1').get('w1');
  // 「見つけたが、まだ2,800円だった」ことが残る（これまでは何も残らなかった）
  assert.equal(row.matched, 1);
  assert.equal(row.price_jpy, 2800);
  assert.equal(row.target_price_jpy, 2500);
  assert.equal(row.reason, 'ABOVE_TARGET');
  assert.equal(row.marketplace, 'YAHOO_JP');
  // 会員IDも検索文も残さない
  assert.ok(!Object.keys(row).includes('member_id'));
  assert.ok(!Object.keys(row).includes('query_text'));
});

test('見つからなかった理由も区別して残し、古い記録は90日で消す', async () => {
  assert.equal(observationReason({ candidateCount: 0, best: null, target: 2500 }), 'NO_CANDIDATES');
  assert.equal(observationReason({ candidateCount: 5, best: null, target: 2500 }), 'NO_MATCH');
  assert.equal(observationReason({ candidateCount: 5, best: { price: 2400 }, target: 2500 }), 'REACHED');
  assert.equal(observationReason({ candidateCount: 5, best: { price: 2600 }, target: 2500 }), 'ABOVE_TARGET');
  const { sqlite, env } = envWithDb();
  sqlite.prepare("INSERT INTO target_price_observations(observation_id,wish_id,observed_at,matched,price_jpy,target_price_jpy,marketplace,candidate_count,reason) VALUES('o1','w1','2026-01-01T00:00:00.000Z',0,NULL,2500,'',0,'NO_MATCH')").run();
  sqlite.prepare("INSERT INTO target_price_observations(observation_id,wish_id,observed_at,matched,price_jpy,target_price_jpy,marketplace,candidate_count,reason) VALUES('o2','w1','2026-09-06T00:00:00.000Z',1,2800,2500,'YAHOO_JP',3,'ABOVE_TARGET')").run();
  assert.deepEqual(await purgeTargetPriceObservations(env, new Date('2026-09-07T00:00:00.000Z')), { deleted: 1 });
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM target_price_observations').get().count, 1);
});
