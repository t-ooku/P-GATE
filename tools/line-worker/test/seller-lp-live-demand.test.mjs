// 2026-09-21 指示書 ⑯「Seller LP の『今の需要』を実データで出す」。
// ・LP は誰でも見るので、出すのは公開できる（5人以上）需要の合計だけ
// ・商品名・条件・個人は返さない
// ・数えられない系統は 0 と言わず measurable:false（§30 架空件数は禁止）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizePublicThreeDemands } from '../src/shop-demand.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const priceWatch = { measurable: true, items: [{ product_name: 'A', people: 18 }, { product_name: 'B', people: 7 }] };
const usual = { measurable: true, items: [{ product_name: 'C', people: 31, within_30_days: 12 }] };
const searchingItems = [{ conditions: '黒・本革', people: 9 }, { conditions: '水筒', people: 7 }];

test('3系統の合計を返す', () => {
  const result = summarizePublicThreeDemands({ searchingItems, priceWatch, usual });
  assert.deepEqual(result.searching, { measurable: true, groups: 2, people: 16 });
  assert.deepEqual(result.price_watch, { measurable: true, groups: 2, people: 25 });
  assert.deepEqual(result.usual, { measurable: true, groups: 1, people: 31, within_30_days: 12 });
});

test('数えられない系統は 0 と言わない', () => {
  const result = summarizePublicThreeDemands({ searchingItems: null, priceWatch: null, usual: { measurable: false, items: [] } });
  assert.deepEqual(result.searching, { measurable: false });
  assert.deepEqual(result.price_watch, { measurable: false });
  assert.deepEqual(result.usual, { measurable: false });
  assert.ok(!JSON.stringify(result).includes('"people"'), '人数を作らない');
});

test('公開できる需要が無いときは 0件（集計はできている）', () => {
  const result = summarizePublicThreeDemands({ searchingItems: [], priceWatch: { measurable: true, items: [] }, usual: { measurable: true, items: [] } });
  assert.deepEqual(result.searching, { measurable: true, groups: 0, people: 0 });
  assert.equal(result.usual.within_30_days, 0);
});

test('商品名・条件・個人を返さない', () => {
  const json = JSON.stringify(summarizePublicThreeDemands({ searchingItems, priceWatch, usual }));
  for (const leak of ['product_name', 'conditions', 'member_id', '黒・本革', 'A']) {
    assert.ok(!json.includes(leak), leak);
  }
});

test('公開ルートが three_demands を返す', () => {
  const source = read('src/shop-demand.mjs');
  assert.match(source, /three_demands: threeDemands/u);
  assert.match(source, /import \{ targetPriceDemand, usualDemandForecast \} from '\.\/usual-demand\.mjs';/u);
  // 系統が1つ落ちても公開ルート全体を落とさない
  assert.match(source, /targetPriceDemand\(env\)\.catch\(\(\) => null\)/u);
  assert.match(source, /usualDemandForecast\(env\)\.catch\(\(\) => null\)/u);
});

test('LP に差し込み先があり、HTML に数字を焼き込んでいない', () => {
  const html = read('public/for-sellers.html');
  assert.match(html, /<div class="demand-totals" id="demandTotals" aria-live="polite"><\/div>/u);
  const strip = html.slice(html.indexOf('id="demandTotals"'), html.indexOf('id="demandNow"'));
  assert.ok(!/\d+人|\d+件/u.test(strip), 'HTML に人数・件数を書かない');
});

test('LP の JS が3系統を描き、集計不能をそう書く', () => {
  const script = read('public/for-sellers.js');
  for (const label of ['探し中', '値下がり待ち', 'いつものホシル']) assert.ok(script.includes(`'${label}'`), label);
  assert.match(script, /lane\?\.measurable === true \? escapeHtml\(String\(lane\.groups\)\) \+ '件' : '—'/u);
  assert.ok(script.includes('いまは集計できていません'), '0人と断定しない');
});

test('スタイルがある（Instagram 寄せ）', () => {
  const css = read('public/instagram-look.css');
  assert.match(css, /\.demand-totals\{display:grid/u);
  assert.match(css, /\.demand-totals:empty\{display:none\}/u, '読み込み前・失敗時に空枠を出さない');
});
