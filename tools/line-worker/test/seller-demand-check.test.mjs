// 2026-09-21 指示書 §30/§31「需要チェック」。
// ・架空件数は禁止。実データだけを返す
// ・5人未満は人数を出さない（below_threshold で伝える）
// ・数えられないときは 0 と断定せず measurable:false
// ・入力された検索語は D1 に書かない
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeDemandQuery, matchesDemandQuery, buildDemandCheck, handleSellerDemandCheckRoute
} from '../src/seller-demand-check.mjs';

test('検索語は整えて 120 文字まで', () => {
  assert.equal(normalizeDemandQuery('  ドッグフード　　A '), 'ドッグフード A');
  assert.equal(normalizeDemandQuery('a'.repeat(200)).length, 120);
  assert.equal(normalizeDemandQuery(), '');
});

test('語がすべて含まれていれば一致（順番は問わない）', () => {
  assert.equal(matchesDemandQuery('黒の本革A4トートバッグ', '黒 トート'), true);
  assert.equal(matchesDemandQuery('黒の本革A4トートバッグ', 'トート 黒'), true);
  assert.equal(matchesDemandQuery('黒の本革A4トートバッグ', '赤 トート'), false);
  assert.equal(matchesDemandQuery('', 'トート'), false);
  assert.equal(matchesDemandQuery('トート', ''), false, '空の検索語で全件一致にしない');
});

const searching = { items: [{ query: 'A4 本革 トート 黒', people: 7 }, { query: '水筒 子供', people: 9 }], min_people: 5 };
const priceWatch = {
  measurable: true, min_people: 5,
  items: [{ product_name: '○○商品 トート 黒', people: 18, median_target_jpy: 1200, steps: [{ price_jpy: 1200, people: 18 }] }]
};
const usual = {
  measurable: true, min_people: 5,
  items: [{ product_name: '○○商品 トート 黒', people: 31, within_30_days: 12, within_14_days: 6, within_7_days: 3 }]
};

test('§31 3種類の需要をまとめて返す', () => {
  const result = buildDemandCheck({ query: 'トート 黒', searching, priceWatch, usual, minPeople: 5 });
  assert.equal(result.searching.people, 7);
  assert.equal(result.price_watch.people, 18);
  assert.equal(result.usual.people, 31);
  assert.equal(result.usual.within_30_days, 12);
  assert.equal(result.total_people, 56);
  assert.equal(result.below_threshold, false);
  assert.equal(result.measurable, true);
  assert.equal(result.price_watch.median_target_jpy, 1200, 'どこまで下げれば届くか');
});

test('当たらなければ人数を作らない（架空件数を返さない）', () => {
  const result = buildDemandCheck({ query: '存在しない商品', searching, priceWatch, usual, minPeople: 5 });
  assert.equal(result.searching.people, 0);
  assert.equal(result.price_watch.people, 0);
  assert.equal(result.usual.people, 0);
  assert.equal(result.total_people, 0);
  assert.equal(result.below_threshold, true, '「0人」ではなく「出せる需要が無い」と伝える');
});

test('1系統でも数えられなければ measurable:false', () => {
  const broken = buildDemandCheck({ query: 'トート 黒', searching, priceWatch: { measurable: false, items: [] }, usual, minPeople: 5 });
  assert.equal(broken.measurable, false);
  const noUsual = buildDemandCheck({ query: 'トート 黒', searching, priceWatch, usual: { measurable: false, items: [] }, minPeople: 5 });
  assert.equal(noUsual.measurable, false);
  const noSearching = buildDemandCheck({ query: 'トート 黒', searching: null, priceWatch, usual, minPeople: 5 });
  assert.equal(noSearching.measurable, false);
});

test('個人情報を返さない', () => {
  const json = JSON.stringify(buildDemandCheck({ query: 'トート 黒', searching, priceWatch, usual, minPeople: 5 }));
  for (const key of ['member_id', 'usual_id', 'wish_id', 'session_id']) assert.ok(!json.includes(key), key);
});

// --- ルート ---
const get = (q) => new Request(`https://hoshilu.app/api/seller/demand-check${q}`);

test('他のルートは奪わない', async () => {
  assert.equal(await handleSellerDemandCheckRoute(new Request('https://hoshilu.app/api/search'), {}), null);
});

test('短すぎる検索語は 400', async () => {
  const response = await handleSellerDemandCheckRoute(get('?q=a'), {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'DEMAND_CHECK_QUERY_TOO_SHORT');
});

test('POST は 405', async () => {
  const response = await handleSellerDemandCheckRoute(
    new Request('https://hoshilu.app/api/seller/demand-check?q=トート', { method: 'POST' }), {});
  assert.equal(response.status, 405);
});

test('D1 が無くても落ちず、measurable:false で返す', async () => {
  const response = await handleSellerDemandCheckRoute(get('?q=%E3%83%88%E3%83%BC%E3%83%88'), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.measurable, false);
  assert.equal(body.total_people, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
});

test('検索語を D1 に書かない（INSERT/UPDATE を持たない）', () => {
  const source = readFileSync(new URL('../src/seller-demand-check.mjs', import.meta.url), 'utf8');
  assert.ok(!/INSERT INTO|UPDATE /u.test(source), 'このモジュールは読み取りだけ');
});

test('index.mjs が /api/seller/demand-check を配線している', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /import \{ handleSellerDemandCheckRoute \} from '\.\/seller-demand-check\.mjs';/u);
  assert.match(index, /const demandCheckResponse = await handleSellerDemandCheckRoute\(request, env\);/u);
});
