// 2026-09-21 指示書 §21〜§24: Seller に見せる継続需要（いつものホシル）と希望価格需要。
// 守るべきこと:
// ・内部会員は除外する（実績を水増ししない）
// ・5人以上の需要だけ見せる。5人未満は件数だけ
// ・member_id / usual_id / wish_id は返さない
// ・数えられないときは 0 と断定せず measurable:false で返す
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  usualDemandKey, summarizeUsualForecast, summarizeTargetPriceDemand,
  usualDemandForecast, targetPriceDemand, FORECAST_WINDOWS_DAYS
} from '../src/usual-demand.mjs';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 21);
const due = (days) => new Date(NOW + days * DAY).toISOString();

const usualRow = (memberId, name, days, extra = {}) => ({
  member_id: memberId, product_name: name, product_key: '', marketplace: 'RAKUTEN_JP',
  next_due_at: due(days), status: 'ACTIVE', ...extra
});

test('同じ商品は product_key、無ければ商品名でまとめる', () => {
  assert.equal(usualDemandKey({ product_key: 'RAKUTEN:shop:1' }), 'key:rakuten:shop:1');
  assert.equal(usualDemandKey({ product_name: '　ドッグフード　A ' }), 'name:ドッグフード a');
  assert.equal(usualDemandKey({}), '');
});

test('§23 需要予報は 7/14/30 日以内の人数を返す（30日には7日の人も含む）', () => {
  const rows = [
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => usualRow(`m${n}`, 'ドッグフードA', 5)),
    ...[9, 10, 11, 12, 13, 14, 15, 16, 17].map((n) => usualRow(`m${n}`, 'ドッグフードA', 12)),
    ...[18, 19, 20, 21, 22, 23, 24, 25].map((n) => usualRow(`m${n}`, 'ドッグフードA', 25))
  ];
  const { items } = summarizeUsualForecast(rows, { now: NOW, minPeople: 5 });
  assert.equal(items.length, 1);
  assert.equal(items[0].product_name, 'ドッグフードA');
  assert.equal(items[0].within_7_days, 8);
  assert.equal(items[0].within_14_days, 17, '7日の人も含む');
  assert.equal(items[0].within_30_days, 25);
  assert.equal(items[0].people, 25);
  assert.deepEqual(FORECAST_WINDOWS_DAYS, [7, 14, 30]);
});

test('5人未満の需要は見せない（件数だけ残す）', () => {
  const rows = [1, 2, 3, 4].map((n) => usualRow(`m${n}`, 'ニッチ商品', 3));
  const result = summarizeUsualForecast(rows, { now: NOW, minPeople: 5 });
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.below_threshold, { groups: 1, people: 4 });
});

test('内部会員は数えない（実績を水増ししない）', () => {
  const rows = [1, 2, 3, 4, 5].map((n) => usualRow(`m${n}`, '洗剤', 3));
  rows.push(usualRow('internal-1', '洗剤', 3), usualRow('internal-2', '洗剤', 3));
  const result = summarizeUsualForecast(rows, { now: NOW, minPeople: 5, internal: new Set(['internal-1', 'internal-2']) });
  assert.equal(result.items[0].people, 5, '内部の2人を足さない');
});

test('同じ人が同じ商品を複数行持っても 1 人として数える', () => {
  const rows = [
    ...[1, 2, 3, 4, 5].map((n) => usualRow(`m${n}`, 'コーヒー', 3)),
    usualRow('m1', 'コーヒー', 4), usualRow('m1', 'コーヒー', 6)
  ];
  assert.equal(summarizeUsualForecast(rows, { now: NOW, minPeople: 5 }).items[0].people, 5);
});

test('止めた行・次回日付が無い行は数えない', () => {
  const rows = [
    ...[1, 2, 3, 4, 5].map((n) => usualRow(`m${n}`, '水', 3)),
    usualRow('m6', '水', 3, { status: 'PAUSED' }),
    usualRow('m7', '水', 3, { next_due_at: '' })
  ];
  assert.equal(summarizeUsualForecast(rows, { now: NOW, minPeople: 5 }).items[0].people, 5);
});

test('個人情報を返さない（member_id / usual_id を含まない）', () => {
  const rows = [1, 2, 3, 4, 5].map((n) => usualRow(`m${n}`, '洗剤', 3, { usual_id: `u${n}` }));
  const json = JSON.stringify(summarizeUsualForecast(rows, { now: NOW, minPeople: 5 }));
  assert.ok(!json.includes('member_id'));
  assert.ok(!json.includes('usual_id'));
  assert.doesNotMatch(json, /"m[0-9]"/u);
});

test('近い需要が多い順に並ぶ', () => {
  const rows = [
    ...[1, 2, 3, 4, 5, 6].map((n) => usualRow(`a${n}`, '先の商品', 25)),
    ...[1, 2, 3, 4, 5].map((n) => usualRow(`b${n}`, '近い商品', 3))
  ];
  const { items } = summarizeUsualForecast(rows, { now: NOW, minPeople: 5 });
  assert.deepEqual(items.map((item) => item.product_name), ['近い商品', '先の商品']);
});

// --- §24 希望価格需要 ---
const watchRow = (memberId, name, price) => ({
  member_id: memberId, target_product_key: '', target_product_name: name, target_price_jpy: price
});

test('§24 どこまで下げれば需要に届くかを返す', () => {
  const rows = [
    ...[1, 2, 3].map((n) => watchRow(`m${n}`, '○○商品', 1500)),
    ...[4, 5, 6, 7].map((n) => watchRow(`m${n}`, '○○商品', 1200)),
    ...[8, 9].map((n) => watchRow(`m${n}`, '○○商品', 900))
  ];
  const { items } = summarizeTargetPriceDemand(rows, { minPeople: 5 });
  assert.equal(items[0].people, 9);
  assert.equal(items[0].highest_target_jpy, 1500);
  assert.equal(items[0].lowest_target_jpy, 900);
  assert.equal(items[0].median_target_jpy, 1200);
  // 1,200 円まで下げれば 1,200 以上を希望している 7 人に届く
  const at1200 = items[0].steps.find((step) => step.price_jpy === 1200);
  assert.equal(at1200.people, 7);
  const at1500 = items[0].steps.find((step) => step.price_jpy === 1500);
  assert.equal(at1500.people, 3);
});

test('希望価格需要も 5人未満は見せず、内部会員を数えない', () => {
  const few = [1, 2, 3].map((n) => watchRow(`m${n}`, '少ない商品', 1000));
  assert.deepEqual(summarizeTargetPriceDemand(few, { minPeople: 5 }).items, []);
  const rows = [...[1, 2, 3, 4, 5].map((n) => watchRow(`m${n}`, '商品', 1000)), watchRow('internal-1', '商品', 1000)];
  const result = summarizeTargetPriceDemand(rows, { minPeople: 5, internal: new Set(['internal-1']) });
  assert.equal(result.items[0].people, 5);
});

test('希望価格が無い行は数えない', () => {
  const rows = [...[1, 2, 3, 4, 5].map((n) => watchRow(`m${n}`, '商品', 1000)), watchRow('m6', '商品', 0), watchRow('m7', '商品', null)];
  assert.equal(summarizeTargetPriceDemand(rows, { minPeople: 5 }).items[0].people, 5);
});

// --- 計測不能の扱い ---
test('D1 が無い・照会に失敗したときは 0 と断定せず measurable:false', async () => {
  for (const env of [{}, { PRODUCT_DB: { prepare() { throw new Error('no such table: main.member_usual_items'); } } }]) {
    const forecast = await usualDemandForecast(env);
    assert.equal(forecast.measurable, false);
    assert.deepEqual(forecast.items, []);
  }
  const broken = { PRODUCT_DB: { prepare() { throw new Error('boom'); } } };
  assert.equal((await targetPriceDemand(broken)).measurable, false);
});

test('照会できたときは measurable:true', async () => {
  const env = {
    PRODUCT_DB: {
      prepare() {
        return { all: async () => ({ results: [1, 2, 3, 4, 5].map((n) => usualRow(`m${n}`, '洗剤', 3)) }) };
      }
    }
  };
  const forecast = await usualDemandForecast(env, { now: NOW, minPeople: 5 });
  assert.equal(forecast.measurable, true);
  assert.equal(forecast.items[0].people, 5);
  assert.equal(forecast.min_people, 5);
});

test('買った後の値下がり待ち（逆ウォッチ）は Seller 集計に入れない', async () => {
  const rows = [
    ...[1, 2, 3, 4, 5].map((n) => ({ ...watchRow(`m${n}`, '商品', 1000), kind: 'TARGET_PRICE' })),
    ...[6, 7, 8].map((n) => ({ ...watchRow(`m${n}`, '商品', 1000), kind: 'POST_PURCHASE' }))
  ];
  const env = { PRODUCT_DB: { prepare() { return { all: async () => ({ results: rows }) }; } } };
  const result = await targetPriceDemand(env, { minPeople: 5 });
  assert.equal(result.items[0].people, 5, 'POST_PURCHASE の3人を足さない');
});

// --- Seller Dashboard への配線（§21 §22） ---
test('Seller Dashboard は 3 種類の需要を返す', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/seller-shop.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ usualDemandForecast, targetPriceDemand \} from '\.\/usual-demand\.mjs';/u);
  assert.match(source, /searching,\s*\/\/ 新規需要/u);
  assert.match(source, /price_watch: price,/u);
  assert.match(source, /usual\s*\/\/ 継続需要/u);
  // /demand と /demand/offers の両方で返す
  assert.equal((source.match(/\.\.\.\(await threeDemands\(env\)\)/gu) || []).length, 2);
});

test('1 種類が計測不能でも他の需要を止めない', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/seller-shop.mjs', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('async function threeDemands'), source.indexOf('async function threeDemands') + 600);
  assert.equal((block.match(/\.catch\(\(\) => null\)/gu) || []).length, 3, '3つとも個別に握る');
  assert.match(block, /Promise\.all/u, '直列にして遅くしない');
});
