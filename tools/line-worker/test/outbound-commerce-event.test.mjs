import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import { buildOutboundCommerceEvent, recordOutboundCommerceEvent } from '../src/outbound-commerce-event.mjs';
import worker, { createTrackToken, decorateAmazonAssociateDestination } from '../src/index.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const migration = readFileSync(new URL('../migrations/0043_outbound_commerce_events.sql', import.meta.url), 'utf8');

function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            run: async () => { const result = statement.run(...values); return { meta: { changes: Number(result.changes || 0) } }; },
            first: async () => statement.get(...values) || null
          };
        }
      };
    }
  };
  return { sqlite, db };
}

// v4.3 指示書 Priority 5 (section 27-30)。

test('v4.3項目28: 送客イベントは指示書section28の最低限フィールドをすべて持つ', () => {
  const event = buildOutboundCommerceEvent({
    u: 'session-hash-abc', r: 'query-intent-id-123', a: 'B000TEST', m: 'AMAZON_JP',
    d: 'https://amazon.co.jp/dp/B000TEST', j: 'seed:asin:AMAZON_JP', hpid: 'HP_deadbeef', sid: 'seller-1', sp: true
  }, '2026-08-08T00:00:00Z');
  assert.deepEqual(Object.keys(event).sort(), [
    'destination_marketplace', 'event_id', 'event_type', 'hoshilu_product_id', 'occurred_at',
    'organic_or_sponsored', 'search_intent_id', 'seller_id', 'session_id', 'source_marketplace'
  ].sort());
  assert.equal(event.destination_marketplace, 'AMAZON_JP');
  assert.equal(event.seller_id, 'seller-1');
  assert.equal(event.organic_or_sponsored, 'SPONSORED');
  assert.equal(event.search_intent_id, 'query-intent-id-123');
  assert.equal(event.session_id, 'session-hash-abc');
  assert.equal(event.hoshilu_product_id, 'HP_deadbeef');
});

test('v4.3項目28: 未知のフィールド(hoshilu_product_id/seller_id等)はNULLになり捏造しない', () => {
  const event = buildOutboundCommerceEvent({ u: 'h', r: 'q1', m: 'RAKUTEN_JP', j: 'seed:x' }, '2026-08-08T00:00:00Z');
  assert.equal(event.hoshilu_product_id, null);
  assert.equal(event.seller_id, null);
  assert.equal(event.organic_or_sponsored, 'ORGANIC');
});

test('v4.3項目29: 検索文そのものはどのフィールドにも含まれない(search_intent_idは既存の匿名クエリIDの再利用)', () => {
  const event = buildOutboundCommerceEvent({ u: 'h', r: 'anonymous-query-id-not-text', m: 'AMAZON_JP', j: 'seed:x' }, '2026-08-08T00:00:00Z');
  const values = Object.values(event).join('|');
  assert.doesNotMatch(values, /顔用扇風機|カバンに入る/);
  assert.equal(event.search_intent_id, 'anonymous-query-id-not-text');
});

test('recordOutboundCommerceEvent: D1未設定時は何もせず例外も投げない', async () => {
  await assert.doesNotReject(recordOutboundCommerceEvent({}, { u: 'h', m: 'AMAZON_JP', j: 'x' }, '2026-08-08T00:00:00Z'));
});

test('recordOutboundCommerceEvent: D1へ永続化し、同じevent_idの再送は冪等(二重計上しない)', async () => {
  const { sqlite, db } = sqliteD1();
  const env = { PRODUCT_DB: db };
  const payload = { u: 'session-hash', r: 'q1', m: 'LOFT_JP', j: 'seed:asin:LOFT_JP' };
  await recordOutboundCommerceEvent(env, payload, '2026-08-08T00:00:00Z');
  await recordOutboundCommerceEvent(env, payload, '2026-08-08T00:00:01Z');
  const rows = sqlite.prepare('SELECT * FROM outbound_commerce_events').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].destination_marketplace, 'LOFT_JP');
  assert.equal(rows[0].session_id, 'session-hash');
});

test('recordOutboundCommerceEvent: D1エラーは握りつぶされ、呼び出し元(/goリダイレクト)を止めない', async () => {
  const failingDb = { prepare() { throw new Error('D1_UNAVAILABLE'); } };
  await assert.doesNotReject(recordOutboundCommerceEvent({ PRODUCT_DB: failingDb }, { u: 'h', m: 'AMAZON_JP', j: 'x' }, '2026-08-08T00:00:00Z'));
});

test('Amazon送客URLだけに現在のアソシエイトIDを付け、既存の検索条件を保つ', () => {
  const decorated = new URL(decorateAmazonAssociateDestination(
    'https://www.amazon.co.jp/dp/B000000ABC?tag=old-tag-22&ref_=test',
    'hoshilu00-22'
  ));
  assert.equal(decorated.searchParams.get('tag'), 'hoshilu00-22');
  assert.equal(decorated.searchParams.get('ref_'), 'test');
  assert.equal(
    new URL(decorateAmazonAssociateDestination(
      'https://www.amazon.co.jp/%E5%95%86%E5%93%81%E5%90%8D/dp/B000000ABC?tag=old-tag-22',
      'hoshilu00-22'
    )).searchParams.get('tag'),
    'hoshilu00-22'
  );
  assert.equal(
    decorateAmazonAssociateDestination('https://search.rakuten.co.jp/search/mall/test/', 'hoshilu00-22'),
    'https://search.rakuten.co.jp/search/mall/test/'
  );
  // 2026-08-17: セール系ページもタグ付け対象になった。HOSHILU自身のサイトから
  // 出ていく送客なので、他人のタグが載っていてもHOSHILUのタグへ差し替える
  // (/dp と同じ扱い)。これが無いと、Amazonのセールページへ何件送客しても
  // 適格販売にならない。
  assert.equal(
    new URL(decorateAmazonAssociateDestination(
      'https://www.amazon.co.jp/deals?tag=other-22', 'hoshilu00-22'
    )).searchParams.get('tag'),
    'hoshilu00-22'
  );
  assert.equal(
    new URL(decorateAmazonAssociateDestination(
      'https://www.amazon.co.jp/gp/goldbox', 'hoshilu00-22'
    )).searchParams.get('tag'),
    'hoshilu00-22'
  );
  // amazon.com は対象外のまま。アソシエイトは国ごとに別アカウントで、
  // JP用タグ(hoshilu00-22)を .com へ付けても報酬は発生しないため。
  assert.equal(
    decorateAmazonAssociateDestination('https://www.amazon.com/dp/B000000ABC?tag=other-20', 'hoshilu00-22'),
    'https://www.amazon.com/dp/B000000ABC?tag=other-20'
  );
  assert.equal(
    decorateAmazonAssociateDestination('https://www.amazon.com/deals', 'hoshilu00-22'),
    'https://www.amazon.com/deals'
  );
  assert.equal(
    new URL(decorateAmazonAssociateDestination(
      'https://www.amazon.co.jp/s?k=humidifier&tag=other-22', ''
    )).searchParams.has('tag'),
    false
  );
});

test('v4.3項目27: GET /go は既存どおり302リダイレクトしつつ、送客イベントも記録する', async () => {
  const { sqlite, db } = sqliteD1();
  const secret = 'l'.repeat(32);
  const token = await createTrackToken({
    u: 'session-hash-xyz', r: 'query-intent-999', a: 'B000000ABC', d: 'https://amazon.co.jp/dp/B000000ABC',
    exp: Math.floor(Date.now() / 1000) + 3600, j: 'seed:B000000ABC:AMAZON_JP', c: 'PWA', m: 'AMAZON_JP'
  }, secret);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: true, result: {} });
  try {
    const request = new Request(`https://hoshilu.app/go?token=${encodeURIComponent(token)}`);
    const env = {
      LINK_SIGNING_SECRET: secret,
      AMAZON_ASSOCIATE_TAG: 'hoshilu00-22',
      GAS_BACKEND_URL: 'https://script.google.com/macros/s/test-deployment/exec',
      GAS_BRIDGE_SECRET: 'g'.repeat(32),
      PRODUCT_DB: db
    };
    const waitUntilPromises = [];
    const context = { waitUntil: (p) => waitUntilPromises.push(p) };
    const response = await worker.fetch(request, env, context);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://amazon.co.jp/dp/B000000ABC?tag=hoshilu00-22');
    await Promise.all(waitUntilPromises);
    const rows = sqlite.prepare('SELECT * FROM outbound_commerce_events').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].destination_marketplace, 'AMAZON_JP');
    assert.equal(rows[0].search_intent_id, 'query-intent-999');
    assert.equal(rows[0].session_id, 'session-hash-xyz');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
