import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { observationsFromCandidates, recordPriceObservations, priceHistorySummary, sellerIdFor, jstDate } from '../src/price-observations.mjs';

// 2026-10-02 指示書「今ほしい人が買うためのサービス」§4④・§5: 価格推移は追記型・1商品×1販売先×1日・捏造しない。

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../migrations/0093_price_observations.sql', import.meta.url), 'utf8'));
  class Statement {
    constructor(sql) { this.statement = sqlite.prepare(sql); this.values = []; }
    bind(...values) { this.values = values; return this; }
    async run() { const result = this.statement.run(...this.values); return { meta: { changes: result.changes } }; }
    async first() { return this.statement.get(...this.values) || null; }
    async all() { return { results: this.statement.all(...this.values) }; }
  }
  const db = { prepare(sql) { return new Statement(sql); }, async batch(statements) { return Promise.all(statements.map((s) => s.run())); } };
  return { sqlite, env: { PRODUCT_DB: db } };
}

const rakuten = (price, extra = {}) => ({
  record_key: 'RAKUTEN:shop-a:item-1', product_name: 'テスト水筒 500ml',
  offers: [{ marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop-a/item-1/', price, shipping_fee: 0, shipping_fee_confirmed: true, total_cost: price, stock_status: 'IN_STOCK', source: 'rakuten_ichiba_api', ...extra }]
});
const yahoo = (price) => ({
  record_key: 'JAN:4901234567894', product_name: 'テスト水筒 500ml',
  offers: [{ marketplace: 'YAHOO_JP', product_url: 'https://store.shopping.yahoo.co.jp/store-b/abc.html', price, shipping_fee: null, shipping_fee_confirmed: false, stock_status: 'IN_STOCK', source: 'yahoo_shopping_api' }]
});

test('候補から 1商品×1販売先×1日 の行を作る。Amazon・ID無し・価格0は入れない', () => {
  const now = new Date('2026-10-02T20:30:00+09:00');
  const rows = observationsFromCandidates([
    rakuten(1980), rakuten(1980), yahoo(2100),
    { record_key: 'AMAZON:B000', offers: [{ marketplace: 'AMAZON_JP', price: 1500, product_url: 'https://www.amazon.co.jp/dp/B000' }] },
    { record_key: 'RAKUTEN:https://item.rakuten.co.jp/x/y/', offers: [{ marketplace: 'RAKUTEN_JP', price: 1000, product_url: 'https://item.rakuten.co.jp/x/y/' }] },
    { record_key: 'RAKUTEN:shop-c:zero', offers: [{ marketplace: 'RAKUTEN_JP', price: 0, product_url: 'https://item.rakuten.co.jp/shop-c/zero/' }] }
  ], { source: 'search', now });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.observation_key), ['RAKUTEN_JP|shop-a:item-1|shop-a|2026-10-02', 'YAHOO_JP|JAN:4901234567894|store-b|2026-10-02']);
  assert.equal(rows[0].total, 1980, '送料確認済み0円なら合計=価格');
  assert.equal(rows[1].shipping, null, '送料未確認は null（0 と書かない）');
  assert.equal(rows[1].total, null);
  assert.equal(rows[1].jan, '4901234567894');
  assert.equal(rows[0].source, 'search');
  assert.equal(jstDate(new Date('2026-10-02T15:30:00Z')), '2026-10-03', 'JST の日付で区切る');
  assert.equal(sellerIdFor('RAKUTEN_JP', 'shop-a:item-1', ''), 'shop-a');
  assert.equal(sellerIdFor('YAHOO_JP', 'x', 'https://store.shopping.yahoo.co.jp/store-b/abc.html'), 'store-b');
});

test('同じ日に2回見たら最安値だけ残し、値上がりでは上書きしない。別の日は別の行', async (t) => {
  const { sqlite, env } = database(t);
  const day1 = new Date('2026-10-02T10:00:00+09:00');
  assert.equal((await recordPriceObservations(env, [rakuten(2200)], { source: 'search', now: day1 })).recorded, 1);
  await recordPriceObservations(env, [rakuten(1980)], { source: 'search', now: new Date('2026-10-02T12:00:00+09:00') });
  await recordPriceObservations(env, [rakuten(2500)], { source: 'search', now: new Date('2026-10-02T13:00:00+09:00') });
  await recordPriceObservations(env, [rakuten(2100)], { source: 'rakuten_ranking_api', now: new Date('2026-10-03T10:00:00+09:00') });
  const rows = sqlite.prepare('SELECT observed_date, price, source FROM price_observations ORDER BY observed_date').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ observed_date: '2026-10-02', price: 1980, source: 'search' }, { observed_date: '2026-10-03', price: 2100, source: 'rakuten_ranking_api' }]);
  // Amazon は CHECK で入らない（記録側でも除外しているが、表でも守る）
  assert.throws(() => sqlite.prepare(`INSERT INTO price_observations (observation_key,record_key,marketplace,external_product_id,price,source,observed_date,observed_at)
    VALUES ('k','AMAZON:x','AMAZON_JP','x',100,'t','2026-10-02','2026-10-02T00:00:00Z')`).run(), /CHECK/u);
});

test('集計は事実だけ: 記録開始日・7日前・30日/90日の最安/中央値/最高。無ければ計測不能', async (t) => {
  const { env } = database(t);
  assert.deepEqual(await priceHistorySummary(env, 'RAKUTEN:shop-a:item-1', { now: new Date('2026-10-02T00:00:00+09:00') }),
    { record_key: 'RAKUTEN:shop-a:item-1', measurable: false, reason: 'NO_OBSERVATIONS' });
  const prices = [2400, 2300, 2200, 2100, 2000, 1980, 2050, 2100, 1900, 2000];
  for (const [index, price] of prices.entries()) {
    await recordPriceObservations(env, [rakuten(price)], { source: 'search', now: new Date(Date.UTC(2026, 8, 20 + index, 3)) });
  }
  const summary = await priceHistorySummary(env, 'RAKUTEN:shop-a:item-1', { now: new Date('2026-09-29T20:00:00+09:00') });
  assert.equal(summary.measurable, true);
  assert.equal(summary.recording_since, '2026-09-20');
  assert.deepEqual(summary.latest, { date: '2026-09-29', price: 2000 });
  assert.deepEqual(summary.seven_days_ago, { date: '2026-09-22', price: 2200 });
  assert.deepEqual(summary.d30, { min: 1900, max: 2400, median: 2100, days_observed: 10 });
  assert.equal(summary.series.length, 10);
  // 表が無くても落ちない（migration 未適用の環境）
  const broken = { PRODUCT_DB: { prepare() { throw new Error('no such table'); }, async batch() { throw new Error('no such table'); } } };
  assert.equal((await recordPriceObservations(broken, [rakuten(1000)])).skipped, 'WRITE_FAILED');
  assert.equal(await priceHistorySummary(broken, 'RAKUTEN:shop-a:item-1'), null);
});

test('検索本文・会員IDは行に入らない（商品の公開情報だけ）', () => {
  const rows = observationsFromCandidates([{ ...rakuten(1980), query: '底が開く 水筒', member_id: 'm1', session_id: 's1' }], { source: 'search' });
  const row = rows[0];
  for (const key of Object.keys(row)) assert.ok(!/query|member|session/u.test(key), key);
  assert.ok(!JSON.stringify(row).includes('底が開く'));
});
