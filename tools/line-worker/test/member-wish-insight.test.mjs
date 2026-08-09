import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import { handleMemberWishRoutes } from '../src/member-wish-v2.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;

// HOSHILU INSIGHT 通知仕様変更指示書 v1.0 section15: 既存のAIウォッチ設定
// (watch_sale/watch_price/watch_coupon/watch_restock)を、HOSHILU INSIGHT側
// (notify_new_matchだけを送る保存条件エディタ)からの保存で silently
// 上書き・再解釈しないことを検証する。

const MEMBER_SESSION_SECRET = 'member-session-secret-at-least-32-chars-long';
const encoder = new TextEncoder();
function b64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}
async function memberCookie(profile, secret = MEMBER_SESSION_SECRET) {
  const body = b64(encoder.encode(JSON.stringify({ ...profile, exp: Math.floor(Date.now() / 1000) + 3600 })));
  return `hoshilu_member_session=${encodeURIComponent(`${body}.${await sign(body, secret)}`)}`;
}

const MIGRATIONS = [
  '0002_member_wishes.sql', '0003_member_wish_preferences.sql',
  '0005_mywatch_notifications.sql', '0036_mywatch_notification_product_fields.sql',
  '0044_insight_search_watch.sql'
];

function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of MIGRATIONS) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            run: async () => {
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes || 0) } };
            },
            first: async () => statement.get(...values) || null,
            all: async () => ({ results: statement.all(...values) })
          };
        }
      };
    },
    batch: async (statements) => Promise.all(statements.map((statement) => statement.run()))
  };
  return { sqlite, db };
}

async function requestFor(env, method, path, cookie, body) {
  return handleMemberWishRoutes(new Request(`https://hoshilu.app${path}`, {
    method,
    headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }), env);
}

test('section15: AIウォッチ(🔔)が保存した4フラグは、INSIGHT側のnotify_new_match単独更新で変更されない', async () => {
  const { db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'member-1', name: 'テスト', provider: 'LINE' });
  // 1) AIウォッチ(🔔)がwatch_coupon/watch_restockをオンにして保存(常に4値
  //    全部を明示的に送る、既存どおりの挙動)。
  const bellSave = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query: '白 長袖 レディース カットソー', language: 'JA',
    watch_sale: true, watch_price: false, watch_coupon: true, watch_restock: true, watch_frequency: 'DAILY'
  });
  assert.equal(bellSave.status, 200);
  const bellWish = (await bellSave.json()).wish;
  assert.equal(bellWish.watch_coupon, 1);
  assert.equal(bellWish.watch_restock, 1);
  assert.equal(bellWish.notify_new_match, 1); // 新規行なのでデフォルトでオン

  // 2) 同じ検索条件をHOSHILU INSIGHT側(notify_new_matchのトグルだけ)で
  //    更新する。watch_*キーは一切送らない。
  const insightUpdate = await requestFor(env, 'PATCH', `/api/member/wishes/${bellWish.wish_id}`, cookie, {
    notify_new_match: false, watch_frequency: 'WEEKLY'
  });
  assert.equal(insightUpdate.status, 200);
  const updated = (await insightUpdate.json()).wish;
  assert.equal(updated.notify_new_match, 0);
  assert.equal(updated.watch_frequency, 'WEEKLY');
  // AIウォッチが設定した値は温存されている(silentに上書き・再解釈されない)
  assert.equal(updated.watch_sale, 1);
  assert.equal(updated.watch_price, 0);
  assert.equal(updated.watch_coupon, 1);
  assert.equal(updated.watch_restock, 1);
});

test('購入希望価格と商品識別情報を保存し、不正な金額を拒否する',async()=>{
  const {db}=sqliteD1();const env={PRODUCT_DB:db,MEMBER_SESSION_SECRET};
  const cookie=await memberCookie({id:'member-target',name:'テスト',provider:'EMAIL'});
  const response=await requestFor(env,'POST','/api/member/wishes',cookie,{query:'LILMOON リルムーン 度あり カラコン',language:'JA',watch_price:true,target_price_jpy:2980,target_product_key:'YAHOO:lilmoon-1',target_product_name:'LILMOON ワンデー 度あり'});
  assert.equal(response.status,200);const wish=(await response.json()).wish;
  assert.equal(wish.target_price_jpy,2980);assert.equal(wish.target_product_key,'YAHOO:lilmoon-1');assert.equal(wish.target_product_name,'LILMOON ワンデー 度あり');
  const invalid=await requestFor(env,'POST','/api/member/wishes',cookie,{query:'LILMOON',target_price_jpy:99});
  assert.equal(invalid.status,400);assert.equal((await invalid.json()).error,'TARGET_PRICE_INVALID');
});

test('section15: HOSHILU INSIGHT側の新規保存(POSTでnotify_new_matchのみ)は既定のAIウォッチ値のみ与え、既存行があれば温存する', async () => {
  const { db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'member-1', name: 'テスト', provider: 'LINE' });
  const bellSave = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query: 'カメラ', language: 'JA',
    watch_sale: false, watch_price: false, watch_coupon: true, watch_restock: false, watch_frequency: 'INSTANT'
  });
  const bellWish = (await bellSave.json()).wish;

  // 検索結果ページの「この条件で新着を通知」ボタン相当のPOST。watch_*を
  // 一切送らない。
  const insightSave = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query: 'カメラ', language: 'JA', notify_new_match: true, watch_frequency: 'INSTANT'
  });
  assert.equal(insightSave.status, 200);
  const merged = (await insightSave.json()).wish;
  assert.equal(merged.wish_id, bellWish.wish_id);
  assert.equal(merged.notify_new_match, 1);
  // AIウォッチが既に設定していた値は上書きされない
  assert.equal(merged.watch_sale, 0);
  assert.equal(merged.watch_coupon, 1);
});

test('section15: 既存データのマイグレーション安全性 - 既存行はwatch_*列を保持したままnotify_new_match=1へ移行する', async () => {
  const { sqlite } = sqliteD1();
  // 0044マイグレーション適用前に相当する行を模して確認(0002〜0036相当の
  // 列だけを埋めてINSERTし、0044のALTER TABLEデフォルトが安全に効くことを
  // 検証する)。
  const now = '2026-01-01T00:00:00Z';
  sqlite.prepare(
    `INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,created_at,updated_at)
    VALUES('legacy-member','legacy-wish','旧いカットソー','JA',1,1,0,0,'INSTANT',?,?)`
  ).run(now, now);
  const row = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('legacy-wish');
  assert.equal(row.notify_new_match, 1); // 実害なく移行 (既存の自動検出処理が存在しないため安全)
  assert.equal(row.condition_snapshot, null);
  assert.equal(row.watch_sale, 1);
  assert.equal(row.watch_price, 1);
});

test('DELETE時にsearch_watch_matchesの重複防止台帳も一緒に削除される(section4の台帳がゴミとして残らない)', async () => {
  const { sqlite, db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'member-1', name: 'テスト', provider: 'LINE' });
  const saved = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query: '白 長袖 レディース カットソー', language: 'JA', notify_new_match: true
  });
  const wish = (await saved.json()).wish;
  const now = '2026-08-08T00:00:00Z';
  sqlite.prepare(
    'INSERT INTO search_watch_matches(member_id,wish_id,product_identity_key,asin,marketplace,matched_at,notification_id) VALUES(?,?,?,?,?,?,?)'
  ).run('member-1', wish.wish_id, 'AMAZON_JP:B000A', 'B000A', 'AMAZON_JP', now, 'notif-1');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM search_watch_matches WHERE wish_id=?').get(wish.wish_id).c, 1);
  const del = await requestFor(env, 'DELETE', `/api/member/wishes/${wish.wish_id}`, cookie);
  assert.equal(del.status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM search_watch_matches WHERE wish_id=?').get(wish.wish_id).c, 0);
});
