import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeRakutenJan, hasC1ListingOptions, hasUnambiguousListedJan } from '../src/rakuten-jan-bridge.mjs';

const jan = '4901234567894';
const title = '評価用グロス #04 4g 1本';
const date = '2026-11-15T10:15:00Z';
const now = Date.parse(date);
const offer = (marketplace, extra = {}) => ({
  marketplace, jan, title, observed_at: date, stock_status: 'IN_STOCK', price: 1300, currency: 'JPY',
  product_url: marketplace === 'YAHOO_JP'
    ? 'https://store.shopping.yahoo.co.jp/qa-fixture/y1.html'
    : 'https://item.rakuten.co.jp/qa-fixture/r1/',
  ...extra
});
const r = offer('RAKUTEN_JP');
const y = offer('YAHOO_JP');
const anchor = { record_key: `JAN:${jan}`, offers: [y] };
const duplicate = { record_key: 'RAKUTEN:qa-fixture:r1', offers: [r] };
const opts = {
  candidates: [anchor, duplicate], yahooCandidates: [anchor], usedCatalogRequests: 2,
  deadlineAt: now + 1000, now: () => now
};

test('C-1: require the printed 13 ASCII digits with no other valid JAN', () => {
  assert.equal(hasUnambiguousListedJan(jan, 'JAN:' + jan, '説明'), true);
  assert.equal(hasUnambiguousListedJan(jan, '説明', 'JANコード：' + jan), true);
  for (const value of ['9' + jan, '１' + jan, jan + '9', jan + '２', '490-1234-567894', jan + ' 4582356615597', '']) {
    assert.equal(hasUnambiguousListedJan(jan, value, ''), false);
  }
  assert.equal(hasUnambiguousListedJan('0000000000000', '0000000000000', ''), false);
});

test('C-1: add one exact Rakuten offer to the Yahoo SKU and remove only the proven duplicate listing', async () => {
  const other = { record_key: 'OTHER', offers: [{ ...r, product_url: 'https://item.rakuten.co.jp/qa-fixture/other/' }] };
  let calls = 0;
  const result = await bridgeRakutenJan({ ...opts, candidates: [anchor, duplicate, other], lookup: async (value, limits) => {
    calls++;
    assert.equal(value, jan);
    assert.equal(limits.requestTimeoutMs, 1000);
    return [{ offers: [{ ...r, total_cost: undefined, shipping_fee_confirmed: false }] }];
  } });
  assert.equal(calls, 1);
  assert.equal(result.status, 'MATCHED');
  assert.deepEqual(result.candidates.map(({ record_key }) => record_key), [anchor.record_key, 'OTHER']);
  assert.deepEqual(result.candidates[0].offers.map(({ marketplace }) => marketplace), ['YAHOO_JP', 'RAKUTEN_JP']);
});

test('C-1: invalid target, exhausted budget, deadline, and already-enriched candidate make no requests', async () => {
  const invalid = { record_key: 'JAN:0000000000000', offers: [{ ...y, jan: '0000000000000' }] };
  const mixed = { ...anchor, offers: [y, r] };
  for (const [overrides, expected] of [
    [{ usedCatalogRequests: 3 }, 'NO_CALL_BUDGET'],
    [{ deadlineAt: now + 799 }, 'NO_TIME_BUDGET'],
    [{ candidates: [invalid], yahooCandidates: [invalid] }, 'NO_VERIFIED_YAHOO_TARGET'],
    [{ candidates: [mixed], yahooCandidates: [mixed] }, 'NO_VERIFIED_YAHOO_TARGET']
  ]) {
    let called = false;
    assert.equal((await bridgeRakutenJan({ ...opts, ...overrides, lookup: () => { called = true; return []; } })).status, expected);
    assert.equal(called, false);
  }
});

test('C-1: conflicting JAN, model, shade, capacity, pack and stock never add a new offer', async () => {
  for (const changed of [
    { jan: '4582356615597' }, { manufacturer_part_number: 'MODEL-OTHER' },
    { title: '評価用グロス S04 4g 1本' }, { title: '評価用グロス #04 8g 1本' },
    { title: '評価用グロス #04 1本' }, { title: '評価用グロス #04 4g 2本' },
    { stock_status: 'UNKNOWN' }, { observed_at: undefined },
    { product_url: 'https://search.rakuten.co.jp/search/mall/qa/' }
  ]) {
    const result = await bridgeRakutenJan({ ...opts, lookup: async () => [{ offers: [{ ...r, ...changed }] }] });
    assert.equal(result.status, 'NO_EXACT_MATCH', JSON.stringify(changed));
    assert.equal(result.candidates, opts.candidates);
  }
});

test('C-1: a bare two-sachet offer, selectable variants, and matching sets are not single-SKU matches', async () => {
  const single = offer('YAHOO_JP', { title: '評価用美容液 #04 4g' });
  const a = { record_key: `JAN:${jan}`, offers: [single] };
  for (const listingTitle of [single.title + ' 2包', single.title + ' タイプをお選びください', single.title + ' カラー選択']) {
    const result = await bridgeRakutenJan({ ...opts, candidates: [a], yahooCandidates: [a],
      lookup: async () => [{ offers: [{ ...r, title: listingTitle }] }] });
    assert.equal(result.status, 'NO_EXACT_MATCH', listingTitle);
  }
  const b = { ...a, offers: [{ ...single, title: single.title + ' 2個セット' }] };
  const matchedSet = await bridgeRakutenJan({ ...opts, candidates: [b], yahooCandidates: [b],
    lookup: () => assert.fail('a set must not start a C-1 lookup') });
  assert.equal(matchedSet.status, 'NO_VERIFIED_YAHOO_TARGET');
  assert.equal(hasC1ListingOptions('評価用グロス #04 4g', 'タイプをお選びください'), true);
  assert.equal(hasC1ListingOptions('評価用グロス #04 4g', 'JAN: ' + jan), false);
});

test('C-1: timeout and errors keep the original candidates, without retry', async () => {
  let calls = 0;
  const timeout = await bridgeRakutenJan({
    ...opts, minRemainingMs: 1, maxLookupMs: 5,
    lookup: () => { calls++; return new Promise(() => {}); }
  });
  assert.equal(timeout.status, 'TIMEOUT');
  assert.equal(timeout.candidates, opts.candidates);
  const failed = await bridgeRakutenJan({ ...opts, lookup: async () => { calls++; throw Error('mock failure'); } });
  assert.equal(failed.status, 'LOOKUP_FAILED');
  assert.equal(failed.candidates, opts.candidates);
  assert.equal(calls, 2);
});

test('C-1 provider adapters: exact Rakuten evidence and explicit Yahoo stock, with fake transport only', async () => {
  const { searchRakutenMarketplace } = await import('../src/rakuten-marketplace-api.mjs');
  const { normalizeYahooShoppingItems } = await import('../src/yahoo-shopping-api.mjs');
  const env = { RAKUTEN_APPLICATION_ID: 'mock', RAKUTEN_ACCESS_KEY: 'mock', RAKUTEN_AFFILIATE_ID: 'mock' };
  const raw = {
    itemName: title, itemCaption: 'JAN:' + jan, itemCode: 'qa:r', itemPrice: 1300,
    itemUrl: r.product_url, availability: 1
  };
  const calls = [];
  const run = (items, value = jan) => searchRakutenMarketplace(env, value, async (url) => {
    calls.push(new URL(url).searchParams.get('keyword'));
    return Response.json({ items });
  }, 'QA', { exactJan: value });
  const hits = await run([raw, { ...raw, itemCaption: '別' }, { ...raw, availability: undefined },
    { ...raw, itemCaption: 'JAN: ' + jan + ' タイプをお選びください' },
    { ...raw, catchcopy: '全3色からお選びください' }]);
  assert.equal(hits.length, 1);
  const [hit] = hits;
  assert.equal(hit.offers[0].jan, jan);
  assert.ok(hit.offers[0].observed_at);
  assert.deepEqual(await run([{ ...raw, itemUrl: 'https://example.invalid/search' }]), []);
  assert.deepEqual(await run([raw], '0000000000000'), []);
  assert.deepEqual(calls, [jan, jan]); // No no-affiliate retry in JAN mode.
  const input = { name: title, url: y.product_url, inStock: true, price: 1300, janCode: jan };
  const [inStock, unconfirmed, selectable] = normalizeYahooShoppingItems({
    hits: [input, { ...input, inStock: undefined }, { ...input, description: 'カラーを選択してください' }]
  }, { janEvidenceObservedAt: date });
  assert.equal(inStock.offers[0].jan, jan);
  assert.equal(inStock.offers[0].observed_at, date);
  assert.equal(unconfirmed.offers[0].observed_at, undefined);
  assert.equal(selectable.offers[0].observed_at, undefined);
});
