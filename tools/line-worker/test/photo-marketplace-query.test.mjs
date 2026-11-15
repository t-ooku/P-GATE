import test from 'node:test';
import assert from 'node:assert/strict';
import { photoMarketplaceQuery, searchPhotoMarketplaces, unusedPhotoKeywords } from '../src/photo-marketplace-query.mjs';

const product = '龍角散ののどすっきりタブレット';
const split = '龍角散 のどすっきりタブレット';
const plan = () => photoMarketplaceQuery(product, '龍角散', product);
const runSingle = (search, plan, { retryCostMs, ...clock }) => searchPhotoMarketplaces(
  [{ key: 'catalog', search, retryCostMs }], plan, clock
).catalog;

test('keeps the specific photo name for both catalogs and only splits at a known brand boundary', () => {
  assert.deepEqual(plan(), { primary: product, retry: split });
  assert.deepEqual(photoMarketplaceQuery(split, '龍角散', product), { primary: split, retry: '' });
  assert.deepEqual(photoMarketplaceQuery(product, '', product), { primary: product, retry: '' });
  assert.deepEqual(photoMarketplaceQuery(product, '株式会社龍角散', product), { primary: product, retry: '' });
  assert.equal(photoMarketplaceQuery('タブレット', '', ''), null);
});

test('a successful empty catalog response triggers one split retry within the original deadline', async () => {
  const calls = [];
  let time = 0;
  const result = await runSingle(async (keyword, budget) => {
    calls.push([keyword, budget]);
    time += 500;
    return keyword === product ? [] : [{ product_name: product }];
  }, plan(), { deadlineAt: 4500, retryCostMs: 3600, now: () => time });
  assert.deepEqual(calls, [[product, 4500], [split, 4000]]);
  assert.deepEqual(result, [{ product_name: product }]);
  const emptyCalls = [];
  assert.deepEqual(await runSingle(async (keyword) => {
    emptyCalls.push(keyword); return [];
  }, plan(), { deadlineAt: 3500, retryCostMs: 1000, now: () => 0 }), []);
  assert.deepEqual(emptyCalls, [product, split]);
});

test('no extra request after a hit, failure, already split keyword, or insufficient Yahoo budget', async () => {
  for (const [result, queryPlan, deadline, now, retryCostMs] of [
    [[{ product_name: product }], plan(), 3500, 0, 1000],
    [null, plan(), 3500, 0, 1000],
    [[], { primary: split, retry: '' }, 3500, 0, 1000],
    [[], plan(), 3500, 0, 3600],
    [[], plan(), 3500, 2900, 1000]
  ]) {
    const calls = [];
    assert.equal(await runSingle(async (keyword) => {
      calls.push(keyword); return result;
    }, queryPlan, { deadlineAt: deadline, retryCostMs, now: () => now }), result);
    assert.deepEqual(calls, [queryPlan.primary]);
  }
  const calls = [];
  await assert.rejects(runSingle(async (keyword) => {
    calls.push(keyword); throw new Error('timeout');
  }, plan(), { deadlineAt: 4500, retryCostMs: 1000, now: () => 0 }), /timeout/);
  assert.deepEqual(calls, [product]);
});

test('only a combined zero allows a retry round, without forcing a late Yahoo call', async () => {
  for (const mode of ['hit', 'failed', 'zero']) {
    const calls = [];
    const runs = searchPhotoMarketplaces([
      { key: 'rakuten', retryCostMs: 1000, search: async (keyword) => { calls.push(['r', keyword]); return []; } },
      { key: 'yahoo', retryCostMs: 3600, search: async (keyword) => {
        calls.push(['y', keyword]);
        if (mode === 'failed') throw new Error('timeout');
        return mode === 'hit' ? [{ product_name: product }] : [];
      } }
    ], plan(), { deadlineAt: 3500, now: () => 0 });
    const results = await Promise.allSettled(Object.values(runs));
    assert.deepEqual(calls, [
      ['r', product], ['y', product], ...(mode === 'zero' ? [['r', split]] : [])
    ]);
    assert.equal(results[1].status, mode === 'failed' ? 'rejected' : 'fulfilled');
  }
});

test('spaced photo name misses: fall back to the existing candidates once, excluding duplicates and respecting original limits', async () => {
  const primary = 'サントリー 特茶 ジャスミン PREMIUM';
  const shorter = '特茶 ジャスミン';
  const photo = photoMarketplaceQuery(primary, 'サントリー', primary);
  const calls = [];
  const run = searchPhotoMarketplaces([{
    key: 'catalog', retryCostMs: 1000, maxVariants: 2,
    search: async (word) => { calls.push(['photo', word]); return []; },
    legacy: async ({ tried, slots }) => {
      const next = unusedPhotoKeywords([primary, shorter, shorter, 'ジャスミン茶'], tried, slots);
      calls.push(['legacy', next]);
      return [shorter];
    }
  }], photo, { deadlineAt: 3500, now: () => 0 });
  assert.deepEqual(await run.catalog, [shorter]);
  assert.deepEqual(calls, [['photo', primary], ['legacy', [shorter]]]);
});

test('legacy never runs on a provider error, hit from another lane, split filling the slots, or an expired budget', async () => {
  const zero = async () => [];
  const blockedLegacy = { key: 'blocked', retryCostMs: 1000, search: zero, legacy: () => assert.fail('legacy not allowed') };
  for (const mode of ['error', 'hit']) {
    const runs = searchPhotoMarketplaces([blockedLegacy, {
      key: 'peer', retryCostMs: 1000, search: async () => {
        if (mode === 'error') throw new Error('timeout');
        return [product];
      }
    }], plan(), { deadlineAt: 3500, now: () => 0 });
    const results = await Promise.allSettled(Object.values(runs));
    assert.deepEqual(results[0], { status: 'fulfilled', value: [] });
  }
  assert.deepEqual(await searchPhotoMarketplaces([blockedLegacy], plan(), { deadlineAt: 3500, now: () => 0 }).blocked, []);
  assert.deepEqual(await searchPhotoMarketplaces([blockedLegacy], { primary: split, retry: '' }, {
    deadlineAt: 3500, now: () => 3000
  }).blocked, []);
});
