// 2026-09-21 指示書 §8「今ホシっとこ / まだ待ってOK」を画面まで通す（P1）。
// ・判断は事実が揃ったときだけ。揃わなければ null（画面には何も出ない）
// ・現在価格は推測しない。本人が同じ商品を値下がり待ちにしていて実測できたものだけ
// ・判断の見出しはサーバーが返す。画面に日本語を複製しない
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  usualBuyAdvice, observedPriceByProductKey, USUAL_ADVICE_LABELS_JA, USUAL_STATE_LABELS_JA
} from '../src/member-usual.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('判断の見出しは状態の4段階とは別に持つ', () => {
  assert.deepEqual(Object.keys(USUAL_ADVICE_LABELS_JA), ['BUY_NOW', 'WAIT']);
  assert.equal(USUAL_ADVICE_LABELS_JA.WAIT, 'まだ待ってOK');
  // 同じ「今ホシっとこ」でも、状態と判断は別の意味なので別の表にする
  assert.equal(USUAL_STATE_LABELS_JA.BUY_NOW, USUAL_ADVICE_LABELS_JA.BUY_NOW);
});

test('価格が比べられなくても、補充が迫っていることは言える', () => {
  const advice = usualBuyAdvice({ state: 'NEARLY', daysLeft: 3 });
  assert.equal(advice.verdict, 'BUY_NOW');
  assert.equal(advice.price_difference_jpy, null, '価格の話はしない');
});

test('まだ先で価格も比べられないときは、何も言い切らない', () => {
  assert.equal(usualBuyAdvice({ state: 'PLENTY', daysLeft: 20 }), null);
  assert.equal(usualBuyAdvice({ state: '', daysLeft: 3 }), null);
  assert.equal(usualBuyAdvice({ state: 'SOON', daysLeft: null }), null);
});

test('まだ先でも、いつもよりはっきり安ければ買い時', () => {
  assert.equal(usualBuyAdvice({ state: 'PLENTY', daysLeft: 20, usualPrice: 1000, currentPriceJpy: 900 }).verdict, 'BUY_NOW');
  // 5% 未満の差は誤差として扱う
  assert.equal(usualBuyAdvice({ state: 'PLENTY', daysLeft: 20, usualPrice: 1000, currentPriceJpy: 970 }).verdict, 'WAIT');
  assert.equal(usualBuyAdvice({ state: 'PLENTY', daysLeft: 20, usualPrice: 1000, currentPriceJpy: 1200 }).verdict, 'WAIT');
});

// --- 現在価格の出どころ ---
const observationDb = (rows) => ({
  PRODUCT_DB: {
    prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) })
  }
});

test('同じ商品で一番新しい実測値だけを使う', async () => {
  const latest = await observedPriceByProductKey(observationDb([
    { product_key: 'asin:B0A', price_jpy: 980, marketplace: 'AMAZON_JP', observed_at: '2026-09-21T00:00:00Z' },
    { product_key: 'asin:B0A', price_jpy: 1200, marketplace: 'AMAZON_JP', observed_at: '2026-09-01T00:00:00Z' },
    { product_key: '', price_jpy: 500, marketplace: '', observed_at: '2026-09-21T00:00:00Z' }
  ]), 'member-1');
  assert.equal(latest.size, 1, '商品キーの無い行は使わない');
  assert.equal(latest.get('asin:B0A').current_price_jpy, 980);
});

test('D1 が無ければ空。0 円を作らない', async () => {
  assert.equal((await observedPriceByProductKey({}, 'member-1')).size, 0);
  assert.equal((await observedPriceByProductKey(observationDb([]), '')).size, 0);
});

test('落ちても一覧を止めない', async () => {
  const broken = { PRODUCT_DB: { prepare: () => { throw new Error('boom'); } } };
  assert.equal((await observedPriceByProductKey(broken, 'member-1')).size, 0);
});

test('一覧が現在価格と判断を返す', () => {
  const source = read('src/member-usual.mjs');
  assert.match(source, /buy_advice: labelledAdvice\(usualBuyAdvice\(\{/u);
  assert.match(source, /const observed = await observedPriceByProductKey\(env, member\.id\);/u);
  // 実測値のテーブル以外から現在価格を作っていない
  assert.match(source, /FROM member_wishes w\s*\n\s*JOIN target_price_observations o ON o\.wish_id=w\.wish_id/u);
});

test('画面は判断の文言を持たず、サーバーの label を出す', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /el\('strong', null, advice\.label \|\| ''\)/u);
  assert.ok(!ui.includes('まだ待ってOK'), '判断の文言を画面に複製しない');
  assert.match(ui, /advice\.verdict === 'BUY_NOW' \|\| advice\.verdict === 'WAIT'/u, '判断が無ければ何も出さない');
});

test('状態と同じことを言うだけなら、二度出さない', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /const repeatsState = advice && advice\.label === label && !hasPriceReason;/u);
  assert.match(ui, /advice && !repeatsState &&/u);
  // price_difference_jpy が null のときに 0 と読み違えないこと
  assert.match(ui, /advice\?\.price_difference_jpy !== null/u);
});

test('画面は値段の差も残り日数もサーバーの数字をそのまま出す', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /advice\.price_difference_jpy/u);
  assert.match(ui, /advice\.days_left/u);
  assert.ok(!/Math\.(?:round|ceil|floor)\([^)]*price/u.test(ui), '画面で価格を計算しない');
});

test('スタイルがある（塗らずに線と文字だけ）', () => {
  const css = read('public/usual-hoshiru.css');
  assert.match(css, /\.usual-row-advice\{/u);
  assert.ok(!/\.usual-row-advice\{[^}]*box-shadow/u.test(css), '影は使わない');
});
