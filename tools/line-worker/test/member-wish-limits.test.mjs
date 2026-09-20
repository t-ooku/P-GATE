import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import { sanitizePublicCandidate } from '../src/index.mjs';
import { normalizeRakutenItems } from '../src/rakuten-marketplace-api.mjs';
import { normalizeYahooShoppingItems } from '../src/yahoo-shopping-api.mjs';
import { sameProduct } from '../src/target-price-watch.mjs';
import { handleMemberWishRoutes, wishLimitsFor, WISH_LIMIT_DEFAULTS } from '../src/member-wish-v2.mjs';

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
  '0065_member_wish_insight_explicit_opt_in.sql',
  '0084_member_wish_archive.sql'
];

function sqliteD1({ explicitOptInColumn = true, archiveColumn = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of MIGRATIONS.filter((migration) => (explicitOptInColumn
    || migration !== '0065_member_wish_insight_explicit_opt_in.sql')
    && (archiveColumn || migration !== '0084_member_wish_archive.sql'))) {
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

// 2026-09-20 GPT 指示書（大隆さん承認）§P0: 保存 100／探し中 10／値下がり待ち 10。
// 11 件目は 409 で「あとで見る」へ促す。既存行は触らない。数は本人の実データだけ。

test('上限は既定で 保存100・探し中10・値下がり待ち10、env で上書きできる', () => {
  assert.deepEqual(wishLimitsFor({}), { saved: 100, searching: 10, price_watch: 10, external_price_watch: 5 });
  assert.deepEqual(WISH_LIMIT_DEFAULTS, { saved: 100, searching: 10, price_watch: 10, external_price_watch: 5 });
  assert.deepEqual(wishLimitsFor({ WISH_LIMIT_SAVED: '3', WISH_LIMIT_SEARCHING: '2', WISH_LIMIT_PRICE_WATCH: 'x', WISH_LIMIT_EXTERNAL_PRICE_WATCH: '2' }), { saved: 3, searching: 2, price_watch: 10, external_price_watch: 2 });
});

test('探し中 11 件目は 409 WISH_SEARCHING_LIMIT_REACHED（保存済みの条件は増えず、既存の探し中はそのまま）', async () => {
  const { db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET, WISH_LIMIT_SEARCHING: '2' };
  const cookie = await memberCookie({ id: 'member-1', name: 'テスト', provider: 'LINE' });
  for (const query of ['子ども 水筒 500ml', 'レインコート キッズ']) {
    const response = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query, language: 'JA', notify_new_match: true, watch_frequency: 'INSTANT' });
    assert.equal(response.status, 200);
  }
  const third = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '通園バッグ', language: 'JA', notify_new_match: true, watch_frequency: 'INSTANT' });
  assert.equal(third.status, 409);
  const body = await third.json();
  assert.equal(body.error, 'WISH_SEARCHING_LIMIT_REACHED');
  assert.equal(body.limit_kind, 'searching');
  assert.equal(body.usage.searching, 2);
  assert.match(body.message, /2 個を探し中です。.*「あとで見る」へ/u);
  // 保存だけ（探し中 OFF）はまだできる
  const savedOnly = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '通園バッグ', language: 'JA' });
  assert.equal(savedOnly.status, 200);
  const list = await (await requestFor(env, 'GET', '/api/member/wishes', cookie)).json();
  assert.equal(list.wishes.length, 3);
  assert.deepEqual(list.usage, { saved: 3, searching: 2, price_watch: 0, external_price_watch: 0 });
  assert.equal(list.limits.searching, 2);
  // 既に探し中の条件を再保存（上書き）しても 409 にならない
  const again = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '子ども 水筒 500ml', language: 'JA', notify_new_match: true, watch_frequency: 'DAILY' });
  assert.equal(again.status, 200);
  // PATCH で 3 件目を探し中にしようとしても 409
  const savedWish = list.wishes.find((wish) => wish.query_text === '通園バッグ');
  const patch = await requestFor(env, 'PATCH', `/api/member/wishes/${savedWish.wish_id}`, cookie, { notify_new_match: true, watch_frequency: 'INSTANT' });
  assert.equal(patch.status, 409);
  // 1 つを「あとで見る」（探し中 OFF）にすると、枠が空く
  const first = list.wishes.find((wish) => wish.query_text === '子ども 水筒 500ml');
  assert.equal((await requestFor(env, 'PATCH', `/api/member/wishes/${first.wish_id}`, cookie, { notify_new_match: false })).status, 200);
  assert.equal((await requestFor(env, 'PATCH', `/api/member/wishes/${savedWish.wish_id}`, cookie, { notify_new_match: true, watch_frequency: 'INSTANT' })).status, 200);
});

test('保存の上限と値下がり待ちの上限も 409 で返す', async () => {
  const { db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET, WISH_LIMIT_SAVED: '2', WISH_LIMIT_PRICE_WATCH: '1' };
  const cookie = await memberCookie({ id: 'member-2', name: 'テスト', provider: 'EMAIL' });
  const price = (query, extra = {}) => requestFor(env, 'POST', '/api/member/wishes', cookie, { query, language: 'JA', watch_sale: false, watch_price: true, watch_coupon: false, watch_restock: false, target_price_jpy: 1980, target_product_name: query, ...extra });
  assert.equal((await price('サーモス 水筒 500ml')).status, 200);
  const secondPrice = await price('象印 水筒 480ml');
  assert.equal(secondPrice.status, 409);
  assert.equal((await secondPrice.json()).error, 'WISH_PRICE_WATCH_LIMIT_REACHED');
  // 同じ商品の希望額を変えるのは上限に数えない
  assert.equal((await price('サーモス 水筒 500ml', { target_price_jpy: 1500 })).status, 200);
  // 保存 2 件目までは OK、3 件目は 409
  assert.equal((await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '通園バッグ', language: 'JA' })).status, 200);
  const third = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: 'レインコート', language: 'JA' });
  assert.equal(third.status, 409);
  assert.equal((await third.json()).error, 'WISH_SAVE_LIMIT_REACHED');
});


// 2026-09-20 GPT 指示書 §3/§7: 貼り付けた商品ページ URL からの値下がり待ちは別枠 5 件。
// 通常の値下がり待ち枠を消費せず、逆に通常の枠が埋まっていても外部 URL は登録できる。

test('外部 URL の値下がり待ちは別枠で数える（通常枠が満杯でも登録でき、別枠が満杯なら 409）', async () => {
  const { db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET, WISH_LIMIT_PRICE_WATCH: '1', WISH_LIMIT_EXTERNAL_PRICE_WATCH: '1' };
  const cookie = await memberCookie({ id: 'member-ext', name: 'テスト', provider: 'LINE' });
  // 通常の値下がり待ちで通常枠を使い切る
  const normal = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '子ども 水筒 500ml', language: 'JA', target_price_jpy: 1980 });
  assert.equal(normal.status, 200);
  const normalFull = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: 'レインコート キッズ', language: 'JA', target_price_jpy: 2500 });
  assert.equal(normalFull.status, 409);
  assert.equal((await normalFull.json()).limit_kind, 'price_watch');
  // 通常枠が満杯でも、貼り付けた商品 URL からの値下がり待ちは別枠なので登録できる
  const external = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '貼り付けた商品', language: 'JA', target_price_jpy: 3000,
    price_condition: { source_url: 'https://www.amazon.co.jp/dp/B0EXAMPLE1' } });
  assert.equal(external.status, 200);
  const list = await (await requestFor(env, 'GET', '/api/member/wishes', cookie)).json();
  assert.equal(list.usage.price_watch, 1);
  assert.equal(list.usage.external_price_watch, 1);
  assert.equal(list.limits.external_price_watch, 1);
  const externalRow = list.wishes.find((wish) => wish.query_text === '貼り付けた商品');
  assert.equal(externalRow.watch_source, 'EXTERNAL_URL');
  assert.equal(externalRow.watch_source_url, 'https://www.amazon.co.jp/dp/B0EXAMPLE1');
  // 別枠も満杯になったら 409
  const externalFull = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '別の貼り付け商品', language: 'JA', target_price_jpy: 4000,
    price_condition: { source_url: 'https://item.rakuten.co.jp/shop/item-1/' } });
  assert.equal(externalFull.status, 409);
  const body = await externalFull.json();
  assert.equal(body.error, 'WISH_EXTERNAL_PRICE_WATCH_LIMIT_REACHED');
  assert.equal(body.limit_kind, 'external_price_watch');
  assert.match(body.message, /貼り付けた URL の値下がり待ちは 1 件までです/u);
});

test('別枠は本人の申告では決まらない。モールの商品ページ URL でなければ通常枠として数える', async () => {
  const { db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET, WISH_LIMIT_PRICE_WATCH: '1', WISH_LIMIT_EXTERNAL_PRICE_WATCH: '5' };
  const cookie = await memberCookie({ id: 'member-fake', name: 'テスト', provider: 'LINE' });
  // 無関係なサイト・http・source だけの自己申告は外部 URL と認めない
  for (const priceCondition of [{ source_url: 'https://example.com/item/1' }, { source_url: 'http://www.amazon.co.jp/dp/B0EXAMPLE1' }, { source: 'EXTERNAL_URL' }]) {
    const { db: fresh } = sqliteD1();
    const freshEnv = { ...env, PRODUCT_DB: fresh };
    const first = await requestFor(freshEnv, 'POST', '/api/member/wishes', cookie, { query: '申告だけの商品', language: 'JA', target_price_jpy: 1200, price_condition: priceCondition });
    assert.equal(first.status, 200);
    const usage = (await (await requestFor(freshEnv, 'GET', '/api/member/wishes', cookie)).json()).usage;
    assert.equal(usage.external_price_watch, 0, JSON.stringify(priceCondition));
    assert.equal(usage.price_watch, 1, JSON.stringify(priceCondition));
  }
});


// 2026-09-20 GPT 指示書 §5（大隆さん承認）: archive =「もう探さない」で終了。
// 一覧から消えるが行は残す。「あとで見る」（一時停止）とは別物。

test('archive は一覧から消して枠を返し、探し中も止める。戻すこともできる（行は消さない）', async () => {
  const { db } = sqliteD1();
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET, WISH_LIMIT_SEARCHING: '1' };
  const cookie = await memberCookie({ id: 'member-archive', name: 'テスト', provider: 'LINE' });
  const created = await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '子ども 水筒 500ml', language: 'JA', notify_new_match: true, watch_frequency: 'INSTANT' });
  assert.equal(created.status, 200);
  const before = await (await requestFor(env, 'GET', '/api/member/wishes', cookie)).json();
  assert.equal(before.wishes.length, 1);
  assert.equal(before.usage.searching, 1);
  // 探し中が上限なので次は 409
  assert.equal((await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: 'レインコート キッズ', language: 'JA', notify_new_match: true, watch_frequency: 'INSTANT' })).status, 409);
  // archive する
  const wishId = before.wishes[0].wish_id;
  const archived = await requestFor(env, 'POST', `/api/member/wishes/${wishId}/archive`, cookie, {});
  assert.equal(archived.status, 200);
  const archivedBody = await archived.json();
  assert.equal(archivedBody.archived, true);
  assert.equal(archivedBody.usage.searching, 0);
  assert.equal(archivedBody.usage.saved, 0);
  // 一覧から消える（行は残っている）
  const after = await (await requestFor(env, 'GET', '/api/member/wishes', cookie)).json();
  assert.deepEqual(after.wishes, []);
  const archivedList = await (await requestFor(env, 'GET', '/api/member/wishes?archived=1', cookie)).json();
  assert.equal(archivedList.wishes.length, 1);
  assert.equal(archivedList.wishes[0].query_text, '子ども 水筒 500ml');
  // 枠が空いたので新しい条件を探し中にできる
  assert.equal((await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: 'レインコート キッズ', language: 'JA', notify_new_match: true, watch_frequency: 'INSTANT' })).status, 200);
  // archive は終了状態なので探し中も止まっている
  const row = await db.prepare('SELECT notify_new_match,insight_enabled_at,archived_at FROM member_wishes WHERE wish_id=?1').bind(wishId).first();
  assert.equal(row.notify_new_match, 0);
  assert.equal(row.insight_enabled_at, null);
  assert.ok(row.archived_at);
  // 戻せる（探し中は自動では再開しない）
  const restored = await requestFor(env, 'POST', `/api/member/wishes/${wishId}/archive`, cookie, { archived: false });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).archived, false);
  const restoredList = await (await requestFor(env, 'GET', '/api/member/wishes', cookie)).json();
  assert.equal(restoredList.wishes.length, 2);
  assert.equal(restoredList.usage.searching, 1);
});

test('migration 0084 適用前でも落ちない（一覧は出る／archive は 503 で断る）', async () => {
  const { db } = sqliteD1({ archiveColumn: false });
  const env = { PRODUCT_DB: db, MEMBER_SESSION_SECRET };
  const cookie = await memberCookie({ id: 'member-pending', name: 'テスト', provider: 'LINE' });
  assert.equal((await requestFor(env, 'POST', '/api/member/wishes', cookie, { query: '子ども 水筒 500ml', language: 'JA' })).status, 200);
  const list = await (await requestFor(env, 'GET', '/api/member/wishes', cookie)).json();
  assert.equal(list.wishes.length, 1);
  assert.equal(list.usage.saved, 1);
  const archivedList = await (await requestFor(env, 'GET', '/api/member/wishes?archived=1', cookie)).json();
  assert.deepEqual(archivedList.wishes, []);
  const archive = await requestFor(env, 'POST', `/api/member/wishes/${list.wishes[0].wish_id}/archive`, cookie, {});
  assert.equal(archive.status, 503);
  assert.equal((await archive.json()).error, 'WISH_ARCHIVE_SCHEMA_PENDING');
});
