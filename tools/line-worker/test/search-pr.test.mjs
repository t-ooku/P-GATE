// 2026-10-09 大隆さん決定「一番上にPR枠を最大2件」（HOSHILU Seller 月額1,980円の優先出品）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickSearchPr, searchPrItems, SEARCH_PR_LIMIT } from '../src/search-pr.mjs';
import { unifyResults } from '../src/unified-results.mjs';

const product = (id, title, over = {}) => ({
  id, title, image_url: `https://img.example/${id}.jpg`, destination_url: `https://item.rakuten.co.jp/shop/${id}/`,
  marketplace: 'RAKUTEN', price_jpy: 1980, price_verified_at: '2026-10-08T03:00:00Z', ...over
});
const pilot = (id, started, products, over = {}) => ({ pilot_id: id, shop_name: `${id}店`, starts_at: started, products, ...over });

test('PR枠は検索語の条件をすべて満たす商品だけ・最大2件・1店1件を先に', () => {
  assert.equal(SEARCH_PR_LIMIT, 2);
  const pilots = [
    pilot('late', '2026-10-05T00:00:00Z', [product('l1', '韓国風 シルバーリング 指輪')]),
    pilot('early', '2026-10-01T00:00:00Z', [product('e1', '韓国風 シルバーリング 指輪 925'), product('e2', 'シルバーリング 指輪 韓国風 細身')]),
    pilot('near', '2026-09-01T00:00:00Z', [product('n1', 'シルバーリング 指輪')]),
    pilot('qa', '2026-09-01T00:00:00Z', [product('q1', '韓国風 シルバーリング 指輪')], { test: true })
  ];
  const picked = pickSearchPr(pilots, '韓国風 シルバーリング 指輪');
  assert.deepEqual(picked.map((item) => `${item.pilot_id}:${item.product_id}`), ['early:e1', 'late:l1']);
  assert.ok(picked.every((item) => item.label === 'PR' && item.source === 'HOSHILU_PR'));
  assert.equal(picked[0].price_jpy, 1980);
  assert.equal(picked[0].price_verified_at, '2026-10-08');
  assert.equal(picked[0].marketplace_label, '楽天市場');
  // 1店しか合わなければ、その店の2件目で埋める。
  assert.deepEqual(pickSearchPr([pilots[1]], '韓国風 シルバーリング 指輪').map((item) => item.product_id), ['e1', 'e2']);
  // 合う商品が無い・条件が取れない時は枠ごと出さない。
  assert.deepEqual(pickSearchPr(pilots, 'ゴールド ネックレス'), []);
  assert.deepEqual(pickSearchPr(pilots, ''), []);
});

test('PR枠は https の URL・画像だけ、確認日の無い価格は出さない', () => {
  const pilots = [pilot('a', '2026-10-01T00:00:00Z', [
    product('1', '本革 トートバッグ', { destination_url: 'http://example.com/1' }),
    product('2', '本革 トートバッグ', { price_jpy: 3000, price_verified_at: '' }),
    product('3', '本革 トートバッグ', { image_url: '' })
  ])];
  const picked = pickSearchPr(pilots, '本革 トートバッグ');
  assert.deepEqual(picked.map((item) => item.product_id), ['2']);
  assert.equal(picked[0].price_jpy, null);
});

test('PR枠の取得に失敗しても検索は止めない／通常の並びには混ぜない', async () => {
  assert.deepEqual(await searchPrItems({}, '本革 トートバッグ', { list: async () => { throw new Error('db'); } }), []);
  const sponsored = pickSearchPr([pilot('a', '2026-10-01T00:00:00Z', [product('1', '本革 トートバッグ')])], '本革 トートバッグ');
  const result = unifyResults({ candidates: [], googleItems: [], query: '本革 トートバッグ', sponsored: [...sponsored, ...sponsored, ...sponsored] });
  assert.equal(result.sponsored.length, 2);
  assert.equal(result.items.length, 0);
  assert.deepEqual(unifyResults({ query: 'x' }).sponsored, []);
});

test('画面はPR枠に必ず「PR」と書き、通常の列とは別の箱で上に出す', () => {
  const ui = readFileSync(new URL('../public/unified-results-ui.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/unified-results-ui.css', import.meta.url), 'utf8');
  assert.match(ui, /el\('span', 'unified-pr-badge', 'PR'\)/u);
  assert.match(ui, /link\.rel = 'noopener noreferrer sponsored'/u);
  assert.match(ui, /source: 'seller_pilot', medium: 'search_pr', campaign:/u);
  assert.ok(ui.indexOf('if (pr) host.append(pr);\n') < ui.indexOf("const list = el('div', 'unified-list');"));
  assert.match(css, /\.unified-pr\{/u);
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /sponsored: searchPr/u);
});
