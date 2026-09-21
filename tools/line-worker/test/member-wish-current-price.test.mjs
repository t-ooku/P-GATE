// 2026-09-21 大隆さん報告/指示:
//  (1)「やはり画像表示できてない」= 同期 POST が price_condition を上書きし target_image_url を消していた
//  (2)「今の価格を常に提示してほしい」= API 確認済みの直近価格を値下がり待ちに返す
// どちらも URL/価格を推測生成しないこと（実測・実 URL のみ）を固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { watchImageUrl, latestObservedPrices } from '../src/member-wish-v2.mjs';

test('watchImageUrl は https の実 URL だけを受け取る', () => {
  assert.equal(watchImageUrl({ target_image_url: 'https://thumbnail.image.rakuten.co.jp/a.jpg' }), 'https://thumbnail.image.rakuten.co.jp/a.jpg');
  assert.equal(watchImageUrl({ target_image_url: 'http://example.com/a.jpg' }), '');
  assert.equal(watchImageUrl({ target_image_url: 'javascript:alert(1)' }), '');
  assert.equal(watchImageUrl({ target_image_url: `https://example.com/${'a'.repeat(600)}.jpg` }), '');
  assert.equal(watchImageUrl({}), '');
  assert.equal(watchImageUrl(), '');
});

const dbWith = (rows) => ({
  PRODUCT_DB: {
    prepare() {
      return { bind: () => ({ all: async () => ({ results: rows }) }) };
    }
  }
});

test('latestObservedPrices は wish ごとに直近の確認価格だけを返す', async () => {
  const latest = await latestObservedPrices(dbWith([
    { wish_id: 'w1', observed_at: '2026-09-21T05:15:47.000Z', price_jpy: 803, marketplace: 'RAKUTEN_JP' },
    { wish_id: 'w1', observed_at: '2026-09-21T04:45:47.000Z', price_jpy: 850, marketplace: 'RAKUTEN_JP' },
    { wish_id: 'w2', observed_at: '2026-09-20T17:00:44.000Z', price_jpy: 780, marketplace: 'RAKUTEN_JP' }
  ]), ['w1', 'w2', 'w3']);
  assert.deepEqual(latest.get('w1'), { last_price_jpy: 803, last_price_marketplace: 'RAKUTEN_JP', last_price_observed_at: '2026-09-21T05:15:47.000Z' });
  assert.equal(latest.get('w2').last_price_jpy, 780);
  // 一度も確認できていない wish は「0 円」ではなく、値を持たない（＝計測不能）
  assert.equal(latest.has('w3'), false);
});

test('latestObservedPrices は wish が無ければ照会しない', async () => {
  let prepared = false;
  const env = { PRODUCT_DB: { prepare() { prepared = true; return { bind: () => ({ all: async () => ({ results: [] }) }) }; } } };
  const latest = await latestObservedPrices(env, []);
  assert.equal(latest.size, 0);
  assert.equal(prepared, false);
});

test('latestObservedPrices は照会に失敗しても値下がり待ちを壊さない', async () => {
  const env = { PRODUCT_DB: { prepare() { throw new Error('no such table'); } } };
  assert.equal((await latestObservedPrices(env, ['w1'])).size, 0);
});

test('POST は画像を送ってこなければ前回の画像を残す', () => {
  const source = readFileSync(new URL('../src/member-wish-v2.mjs', import.meta.url), 'utf8');
  assert.match(source, /watchImageUrl\(payload\.price_condition\) \|\| watchImageUrl\(previousPrice\)/);
});

test('値下がり待ちの行はいまの価格と確認時刻を出し、無いときは 0 円と言わない', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('いまの価格 '));
  assert.ok(app.includes('いまの価格はまだ確認できていません'));
  assert.ok(app.includes('entrusted-row-now'));
  assert.ok(app.includes('希望額まで あと'));
});

test('端末に残す希望価格の設定も商品画像を保持する', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const line = app.split('\n').find((text) => text.startsWith('function storeWatchPreference('));
  assert.ok(line && line.includes('target_image_url'));
});
