import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import { runTargetPriceScan } from '../src/target-price-watch.mjs';

globalThis.crypto??=cryptoModule.webcrypto;

function envWithDb(){
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['0002_member_wishes.sql','0003_member_wish_preferences.sql','0005_mywatch_notifications.sql','0031_member_notification_destinations.sql','0036_mywatch_notification_product_fields.sql','0044_insight_search_watch.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
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
