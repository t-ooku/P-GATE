import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import { sanitizePublicCandidate } from '../src/index.mjs';
import { normalizeRakutenItems } from '../src/rakuten-marketplace-api.mjs';
import { normalizeYahooShoppingItems } from '../src/yahoo-shopping-api.mjs';
import { sameProduct } from '../src/target-price-watch.mjs';
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
  '0004_unmet_demand_events.sql', '0012_growth_events.sql',
  '0013_growth_event_traffic_class.sql', '0047_growth_visitor_sessions.sql',
  '0002_member_wishes.sql', '0003_member_wish_preferences.sql',
  '0005_mywatch_notifications.sql', '0036_mywatch_notification_product_fields.sql',
  '0044_insight_search_watch.sql',
  '0065_member_wish_insight_explicit_opt_in.sql'
];

function sqliteD1({ explicitOptInColumn = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of MIGRATIONS.filter((migration) => explicitOptInColumn
    || migration !== '0065_member_wish_insight_explicit_opt_in.sql')) {
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
  assert.equal(bellWish.notify_new_match, 0); // 通常保存は継続検索へ暗黙opt-inしない
  assert.equal(bellWish.insight_enabled_at, null);

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
  assert.ok(merged.insight_enabled_at);
  // AIウォッチが既に設定していた値は上書きされない
  assert.equal(merged.watch_sale, 0);
  assert.equal(merged.watch_coupon, 1);
});

test('継続検索の有効化CVは認証済みPOSTとOFF→ONだけをサーバーで一度ずつ記録する', async () => {
  const { sqlite, db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'member-growth', name: 'テスト', provider: 'EMAIL' });
  const query = '青い小型のコードレス掃除機';

  const created = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query, language: 'JA' });
  assert.equal(created.status, 200);
  const wish = (await created.json()).wish;
  assert.equal(wish.notify_new_match, 0);
  assert.equal(wish.insight_enabled_at, null);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='continuous_search_enabled'").get().total, 0);

  const enabled = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query, language: 'JA', notify_new_match: true
  });
  assert.equal(enabled.status, 200);
  assert.ok((await enabled.json()).wish.insight_enabled_at);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='continuous_search_enabled'").get().total, 1);

  const unchanged = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query, language: 'JA', notify_new_match: true
  });
  assert.equal(unchanged.status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='continuous_search_enabled'").get().total, 1);

  assert.equal((await requestFor(env, 'PATCH', `/api/member/wishes/${wish.wish_id}`, cookie, {
    notify_new_match: false
  })).status, 200);
  const reenabled = await requestFor(env, 'PATCH', `/api/member/wishes/${wish.wish_id}`, cookie, {
    notify_new_match: true
  });
  assert.equal(reenabled.status, 200);
  assert.equal((await reenabled.json()).wish.notify_new_match, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='continuous_search_enabled'").get().total, 2);
  const rows = sqlite.prepare("SELECT source,medium,campaign,content,marketplace,visitor_id,session_id FROM growth_events WHERE event_type='continuous_search_enabled'").all();
  assert.deepEqual(rows.map(row => ({ ...row })), Array(2).fill({
    source: 'worker', medium: 'member_wish', campaign: 'authenticated_enable',
    content: '', marketplace: '', visitor_id: '', session_id: ''
  }));
  assert.doesNotMatch(JSON.stringify(rows), /青い|member-growth/u);
});

test('同じOFF状態への並行有効化は決定的transition IDで一度だけ計測し、localeを保持する', async () => {
  const { sqlite, db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'member-concurrent', name: 'Test', provider: 'EMAIL' });
  const created = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query: 'compact blue vacuum', language: 'EN', notify_new_match: false
  });
  const wish = (await created.json()).wish;
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='continuous_search_enabled'").get().total, 0);

  const responses = await Promise.all([
    requestFor(env, 'PATCH', `/api/member/wishes/${wish.wish_id}`, cookie, { notify_new_match: true }),
    requestFor(env, 'PATCH', `/api/member/wishes/${wish.wish_id}`, cookie, { notify_new_match: true })
  ]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  const events = sqlite.prepare("SELECT event_id,locale,source,medium FROM growth_events WHERE event_type='continuous_search_enabled'").all();
  assert.equal(events.length, 1);
  assert.equal(events[0].locale, 'EN');
  assert.match(events[0].event_id, /^continuous_search_enabled:[a-f0-9]{64}$/u);
  assert.doesNotMatch(events[0].event_id, /member-concurrent|compact/u);
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
  assert.equal(row.notify_new_match, 1); // 0044のlegacy defaultは残る
  assert.equal(row.insight_enabled_at, null); // 0065の明示同意がないためscan対象外
  assert.equal(row.condition_snapshot, null);
  assert.equal(row.watch_sale, 1);
  assert.equal(row.watch_price, 1);
});

test('0065適用前は通常保存をOFFで継続できるが、明示ONは503でfail closedする', async () => {
  const { db } = sqliteD1({ explicitOptInColumn: false });
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'member-old-schema', name: 'Test', provider: 'EMAIL' });
  const generic = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query: 'legacy schema camera', language: 'EN', watch_price: true
  });
  assert.equal(generic.status, 200);
  const wish = (await generic.json()).wish;
  assert.equal(wish.notify_new_match, 0);
  assert.equal(wish.insight_enabled_at, null);

  const explicit = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query: 'legacy schema camera', language: 'EN', notify_new_match: true, watch_frequency: 'INSTANT'
  });
  assert.equal(explicit.status, 503);
  assert.equal((await explicit.json()).error, 'INSIGHT_OPT_IN_TEMPORARILY_UNAVAILABLE');
  const explicitPatch = await requestFor(env, 'PATCH', `/api/member/wishes/${wish.wish_id}`, cookie, {
    notify_new_match: true, watch_frequency: 'INSTANT'
  });
  assert.equal(explicitPatch.status, 503);
  assert.equal((await explicitPatch.json()).error, 'INSIGHT_OPT_IN_TEMPORARILY_UNAVAILABLE');
});

test('OFFまたはMUTEDへ変更すると全channelのPENDING INSIGHT通知を即時取消し、再ONでも復活しない', async () => {
  const { sqlite, db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'member-cancel', name: 'Test', provider: 'EMAIL' });
  const create = async (query) => (await (await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query, language: 'EN', notify_new_match: true, watch_frequency: 'DAILY'
  })).json()).wish;
  const insertPending = (wish, suffix) => {
    const now = '2026-08-29T00:00:00.000Z';
    for (const channel of ['WEB', 'LINE', 'EMAIL']) sqlite.prepare(
      `INSERT INTO mywatch_notifications
      (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,created_at,updated_at)
      VALUES(?,?,?,?,? ,?,?,'','PENDING',0,?,?,?)`
    ).run(`${suffix}-${channel}`, 'member-cancel', wish.wish_id, `${suffix}-event`, 'INSIGHT_NEW_MATCH', channel, 'New match', now, now, now);
  };

  const offWish = await create('camera cancel off');
  insertPending(offWish, 'off');
  const off = await requestFor(env, 'PATCH', `/api/member/wishes/${offWish.wish_id}`, cookie, {
    notify_new_match: false
  });
  assert.equal(off.status, 200);

  const mutedWish = await create('camera cancel muted');
  insertPending(mutedWish, 'muted');
  const muted = await requestFor(env, 'PATCH', `/api/member/wishes/${mutedWish.wish_id}`, cookie, {
    notify_new_match: true, watch_frequency: 'MUTED'
  });
  assert.equal(muted.status, 200);
  assert.equal((await muted.json()).wish.insight_enabled_at, null);

  const cancelled = sqlite.prepare(
    "SELECT notification_id,status FROM mywatch_notifications ORDER BY notification_id"
  ).all();
  assert.equal(cancelled.length, 6);
  assert.ok(cancelled.every((row) => row.status === 'CANCELLED'));

  const resumed = await requestFor(env, 'PATCH', `/api/member/wishes/${offWish.wish_id}`, cookie, {
    notify_new_match: true, watch_frequency: 'INSTANT'
  });
  assert.equal(resumed.status, 200);
  assert.ok((await resumed.json()).wish.insight_enabled_at);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS total FROM mywatch_notifications WHERE notification_id LIKE 'off-%' AND status='PENDING'"
  ).get().total, 0);

  // 検索結果CTAはPOSTでMUTEDをINSTANTへ明示的に戻して再開する。
  const resumedFromResult = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
    query: 'camera cancel muted', language: 'EN', notify_new_match: true, watch_frequency: 'INSTANT'
  });
  assert.equal(resumedFromResult.status, 200);
  const resumedMuted = (await resumedFromResult.json()).wish;
  assert.equal(resumedMuted.wish_id, mutedWish.wish_id);
  assert.equal(resumedMuted.watch_frequency, 'INSTANT');
  assert.ok(resumedMuted.insight_enabled_at);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS total FROM mywatch_notifications WHERE notification_id LIKE 'muted-%' AND status='PENDING'"
  ).get().total, 0);
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

// 2026-09-05 夜 大隆さん決定「逆ウォッチ」: 買った値段より安くなったら30日以内に通知。
test('逆ウォッチ: 買った価格を送ると希望価格=購入価格-1・30日期限で保存し、不正な金額は拒否する',async()=>{
  const {db}=sqliteD1();const env={PRODUCT_DB:db,MEMBER_SESSION_SECRET};
  const cookie=await memberCookie({id:'member-post',name:'テスト',provider:'EMAIL'});
  const before=Date.now();
  const response=await requestFor(env,'POST','/api/member/wishes',cookie,{query:'コンビ ベビーカー スゴカル',language:'JA',watch_price:true,watch_kind:'POST_PURCHASE',purchase_price_jpy:32800,target_product_key:'RAKUTEN:combi-1',target_product_name:'コンビ ベビーカー スゴカル'});
  assert.equal(response.status,200);const wish=(await response.json()).wish;
  assert.equal(wish.watch_kind,'POST_PURCHASE');assert.equal(wish.purchase_price_jpy,32800);assert.equal(wish.target_price_jpy,32799);
  const expires=Date.parse(wish.expires_at);assert.ok(expires>=before+29*86_400_000&&expires<=before+31*86_400_000);
  const invalid=await requestFor(env,'POST','/api/member/wishes',cookie,{query:'コンビ ベビーカー',watch_kind:'POST_PURCHASE',purchase_price_jpy:50});
  assert.equal(invalid.status,400);assert.equal((await invalid.json()).error,'PURCHASE_PRICE_INVALID');
});


test('楽天・Yahoo!の商品IDは公開検索→会員保存→読戻し→巡回照合まで残る', async () => {
  const { db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'identity-regression', provider: 'LINE' });
  const fixtures = [
    normalizeRakutenItems({ Items: [{ Item: { itemCode: 'shop:item-1', itemName: 'テスト バッグ 青', itemPrice: 2800, itemUrl: 'https://item.rakuten.co.jp/shop/item-1/' } }] })[0],
    normalizeYahooShoppingItems({ hits: [{ code: 'shop_item-2', name: 'テスト バッグ 赤', price: 2800, url: 'https://store.shopping.yahoo.co.jp/shop/item-2.html' }] })[0],
    normalizeYahooShoppingItems({ hits: [{ code: 'shop_item-3', janCode: '4900000000001', name: 'テスト バッグ 黒', price: 2800, url: 'https://store.shopping.yahoo.co.jp/shop/item-3.html' }] })[0]
  ];
  for (const candidate of fixtures) {
    const publicCandidate = sanitizePublicCandidate(candidate);
    assert.equal(publicCandidate.target_product_key, candidate.record_key);
    assert.equal('record_key' in publicCandidate, false);
    const response = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
      query: publicCandidate.product_name, watch_price: true, target_price_jpy: 2500,
      target_product_key: publicCandidate.target_product_key, target_product_name: publicCandidate.product_name
    });
    assert.equal(response.status, 200);
    const saved = (await response.json()).wish;
    assert.equal(saved.target_product_key, candidate.record_key);
    assert.equal(saved.condition_snapshot.price_condition.target_product_key, candidate.record_key);
    assert.equal(sameProduct(saved, { ...candidate, display_name: 'キャンペーン文が変更された商品' }), true);
    assert.equal(sameProduct(saved, { ...candidate, record_key: 'YAHOO:other-item' }), false);
    const listed = (await (await requestFor(env, 'GET', '/api/member/wishes', cookie)).json()).wishes;
    assert.equal(listed.find(row => row.wish_id === saved.wish_id).target_product_key, candidate.record_key);
    // 古い端末の空ID同期と価格だけのPATCHでも既知のIDを消さない。
    const synced = await requestFor(env, 'POST', '/api/member/wishes', cookie, {
      query: publicCandidate.product_name, watch_price: true, target_price_jpy: 2400,
      target_product_key: '', target_product_name: publicCandidate.product_name
    });
    assert.equal((await synced.json()).wish.target_product_key, candidate.record_key);
    const patched = await requestFor(env, 'PATCH', `/api/member/wishes/${saved.wish_id}`, cookie, { target_price_jpy: 2300 });
    const updated = (await patched.json()).wish;
    assert.equal(updated.target_product_key, candidate.record_key);
    assert.equal(updated.target_product_name, publicCandidate.product_name);
    const changed = await requestFor(env, 'PATCH', `/api/member/wishes/${saved.wish_id}`, cookie, {
      target_price_jpy: 2300, target_product_name: '別の商品'
    });
    assert.equal((await changed.json()).wish.target_product_key, '');
  }
});
