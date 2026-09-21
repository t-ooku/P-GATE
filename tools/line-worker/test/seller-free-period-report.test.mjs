// 2026-09-21 指示書 §40「無料3か月終了時」（P1）。
// ・取れた数字だけを出す。取れなかった項目は 0 ではなく「計測不能」
// ・見込み売上・推定効果は出さない。クリックは売上ではない
// ・無料期間の記録が無ければレポート自体を出さない（期間を推測しない）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FREE_MONTHS, REPORT_METRICS, freePeriodWindow, summarizeFreePeriod, freePeriodCounts,
  handleSellerFreePeriodReportRoute
} from '../src/seller-free-period-report.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('無料期間は3か月。終了日から3か月さかのぼる', () => {
  assert.equal(FREE_MONTHS, 3);
  const window = freePeriodWindow('2026-09-30T00:00:00.000Z');
  assert.equal(window.start_at, '2026-06-30T00:00:00.000Z');
  assert.equal(window.end_at, '2026-09-30T00:00:00.000Z');
  assert.equal(window.months, 3);
});

test('終了日が無ければ期間を作らない', () => {
  assert.equal(freePeriodWindow(''), null);
  assert.equal(freePeriodWindow('いつか'), null);
  assert.equal(freePeriodWindow(), null);
});

test('数えられた項目だけ value を持つ', () => {
  const report = summarizeFreePeriod({ shop_views: 132, product_clicks: 0, demand_match_clicks: null });
  const byKey = Object.fromEntries(report.metrics.map((metric) => [metric.key, metric]));
  assert.equal(byKey.shop_views.value, 132);
  assert.equal(byKey.product_clicks.value, 0, '本当に0件だったときは 0 と出してよい');
  assert.equal(byKey.product_clicks.measurable, true);
  assert.equal(byKey.demand_match_clicks.measurable, false);
  assert.equal('value' in byKey.demand_match_clicks, false, '計測不能に 0 を入れない');
});

test('1つも数えられなければ fully_measurable は false', () => {
  const report = summarizeFreePeriod({});
  assert.equal(report.measurable_count, 0);
  assert.equal(report.fully_measurable, false);
  assert.ok(!JSON.stringify(report).includes('"value"'), '数字を作らない');
});

test('出す項目に「見込み売上」「推定」を含めない', () => {
  const json = JSON.stringify(REPORT_METRICS);
  for (const banned of ['見込み', '推定', '予測', '売上']) {
    // 「売上ではありません」という注意書きは可。見出しに売上を掲げないことを見る。
    assert.ok(!REPORT_METRICS.some((metric) => metric.label.includes(banned)), banned);
  }
  assert.ok(json.includes('売上・注文件数ではありません'), 'クリックが売上でないことを明記する');
});

test('数えられなければ null を返す（0 にしない）', async () => {
  const broken = { PRODUCT_DB: { prepare: () => { throw new Error('boom'); } } };
  const counts = await freePeriodCounts(broken, {
    sellerKey: 'k', slugs: ['a'], sellerIds: ['b'], window: freePeriodWindow('2026-09-30T00:00:00Z')
  });
  for (const [key, value] of Object.entries(counts)) assert.equal(value, null, key);
});

test('ショップも店舗も無ければ、その項目は計測不能のまま', async () => {
  const db = { PRODUCT_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ n: 4 }) }) }) } };
  const counts = await freePeriodCounts(db, {
    sellerKey: 'k', slugs: [], sellerIds: [], window: freePeriodWindow('2026-09-30T00:00:00Z')
  });
  assert.equal(counts.shop_views, null, 'ショップが無ければ 0 と言わない');
  assert.equal(counts.product_clicks, null);
  assert.equal(counts.demand_match_clicks, 4);
});

// --- ルート ---
test('他のルートは奪わない', async () => {
  assert.equal(await handleSellerFreePeriodReportRoute(new Request('https://hoshilu.app/api/seller/shop'), {}), null);
});

test('POST は 405、未ログインは 401', async () => {
  const post = await handleSellerFreePeriodReportRoute(
    new Request('https://hoshilu.app/api/seller/free-period-report', { method: 'POST' }), {});
  assert.equal(post.status, 405);
  const anonymous = await handleSellerFreePeriodReportRoute(
    new Request('https://hoshilu.app/api/seller/free-period-report'), {});
  assert.equal(anonymous.status, 401);
});

test('読み取り専用（このモジュールは書き込まない）', () => {
  const source = read('src/seller-free-period-report.mjs');
  assert.ok(!/INSERT INTO|UPDATE |DELETE FROM/u.test(source), 'レポートは読むだけ');
  assert.match(source, /'x-robots-tag': 'noindex'/u);
});

test('SHOP訪問は、端末が確認できた閲覧だけを数える', () => {
  const source = read('src/seller-free-period-report.mjs');
  assert.match(source, /event_type='shop_view_confirmed'/u);
  assert.ok(!source.includes("event_type='shop_viewed'"), 'クローラと区別できない記録は使わない');
  assert.match(source, /traffic_class<>'QA'/u, '内部テストを除く');
});

test('index.mjs が配線している', () => {
  const index = read('src/index.mjs');
  assert.match(index, /import \{ handleSellerFreePeriodReportRoute \} from '\.\/seller-free-period-report\.mjs';/u);
  assert.match(index, /const freePeriodResponse = await handleSellerFreePeriodReportRoute\(request, env\);/u);
});

test('ダッシュボードに枠があり、中身が来るまで出さない', () => {
  const page = read('src/seller-page.mjs');
  assert.match(page, /<section class="auth-card" id="free-period" hidden>/u);
  assert.match(page, /id="sellerFreePeriod"/u);
  const block = page.slice(page.indexOf('id="free-period"'), page.indexOf('id="performance"'));
  assert.ok(!/\d+件|\d+人/u.test(block), 'HTML に数字を焼き込まない');
});

test('画面は計測不能を 0 と書かない', () => {
  const script = read('public/seller.js');
  assert.match(script, /metric\.measurable === true \? Number\(metric\.value\)\.toLocaleString\('ja-JP'\) : '計測不能'/u);
  assert.ok(script.includes('0件という意味ではありません'), '計測不能の意味を言う');
  assert.ok(script.includes('売上・注文・掲載順位は保証しません'), '保証しないことを添える');
});
