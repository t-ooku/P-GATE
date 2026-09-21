// 2026-09-21 指示書 §23「需要予報」（P1）。
// ・いつものホシルの補充周期から 7/14/30 日以内に必要になる人数を出す
// ・匿名集計・5人以上だけ。架空件数は出さない（§30）
// ・集計できていないときは 0 と書かず、表そのものを出さない
// ・予報は見込みであって、注文の保証ではないと書く
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORECAST_WINDOWS_DAYS, summarizeUsualForecast } from '../src/usual-demand.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = () => read('src/seller-page.mjs');
const script = () => read('public/seller.js');

test('予報の窓は 7 / 14 / 30 日', () => {
  assert.deepEqual([...FORECAST_WINDOWS_DAYS], [7, 14, 30]);
});

test('5人未満は人数を出さず、集計待ちとして数えるだけ', () => {
  const now = Date.parse('2026-09-21T00:00:00Z');
  const due = (days) => new Date(now + days * 86_400_000).toISOString();
  const rows = [];
  // 同じ商品を6人が継続 → 出す
  for (let index = 0; index < 6; index += 1) {
    rows.push({ member_id: `m${index}`, product_key: 'k1', product_name: 'コーヒー豆', next_due_at: due(index), status: 'ACTIVE' });
  }
  // 別の商品は2人だけ → 出さない
  rows.push({ member_id: 'x1', product_key: 'k2', product_name: '少数派', next_due_at: due(1), status: 'ACTIVE' });
  rows.push({ member_id: 'x2', product_key: 'k2', product_name: '少数派', next_due_at: due(1), status: 'ACTIVE' });
  const summary = summarizeUsualForecast(rows, { now, minPeople: 5, internal: new Set() });
  assert.equal(summary.items.length, 1);
  assert.equal(summary.items[0].people, 6);
  assert.equal(summary.items[0].within_7_days, 6);
  assert.equal(summary.below_threshold.groups, 1);
  assert.ok(!JSON.stringify(summary.items).includes('少数派'), '5人未満の商品名は出さない');
});

test('ダッシュボードに枠があり、中身が来るまで出さない', () => {
  const html = page();
  assert.match(html, /<section class="auth-card" id="forecast" hidden>/u);
  assert.match(html, /id="sellerForecastRows"/u);
  const block = html.slice(html.indexOf('id="forecast"'), html.indexOf('id="demand-match"'));
  // 見出しと注意書きだけ。数字は JS が実データで入れる（tbody は空で出す）。
  assert.match(block, /<tbody id="sellerForecastRows"><\/tbody>/u, '行を焼き込まない');
  assert.ok(!block.includes('${'), 'テンプレート変数で数字を入れない');
  assert.ok(block.includes('7日以内') && block.includes('14日以内') && block.includes('30日以内'), '3つの窓を出す');
});

test('管理メニューから行ける', () => {
  assert.match(page(), /href="#forecast">需要予報<\/a>/u);
});

test('画面はサーバーの数字をそのまま出す', () => {
  const text = script();
  assert.match(text, /item\.within_7_days/u);
  assert.match(text, /item\.within_14_days/u);
  assert.match(text, /item\.within_30_days/u);
  assert.match(text, /usual\.measurable !== false && Array\.isArray\(usual\.items\)/u, '集計不能なら表を出さない');
  assert.match(text, /section\.hidden = true/u);
});

test('予報が保証でないことを書く', () => {
  assert.ok(script().includes('注文を保証するものではありません'));
});

test('/demand の応答からそのまま描く（別の呼び出しを足さない）', () => {
  const text = script();
  assert.match(text, /renderForecast\(data\.usual\);/u);
  const block = text.slice(text.indexOf('function renderForecast'), text.indexOf('function renderDemand'));
  assert.ok(!block.includes('fetch('), '専用の API を増やさない');
  for (const key of ['member_id', 'usual_id', 'session_id']) assert.ok(!block.includes(key), key);
});
