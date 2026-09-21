// 2026-09-21 指示書 P2「今週の補充最適化・まとめ買い最適化」。
// ・同じモールで補充が近いものを、1回の買い物としてまとめる
// ・節約額は言わない（送料が取れていないので、いくら浮くかは数えられない）
// ・モールが分からないものは無理に寄せない
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUY_TOGETHER_MIN_ITEMS, buyTogetherGroups } from '../src/member-usual.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-21T00:00:00Z');
const due = (days) => new Date(NOW + days * 86_400_000).toISOString();
const item = (id, marketplace, days, status = 'ACTIVE') =>
  ({ usual_id: id, marketplace, next_due_at: due(days), status });

test('まとめるのは2点から', () => {
  assert.equal(BUY_TOGETHER_MIN_ITEMS, 2);
  const one = buyTogetherGroups([item('a', 'AMAZON_JP', 1)], { now: NOW });
  assert.deepEqual(one.together, [], '1点だけならまとめない');
  assert.deepEqual(one.alone, ['a']);
});

test('同じモールで近いものをまとめる', () => {
  const result = buyTogetherGroups([
    item('a', 'AMAZON_JP', 1), item('b', 'AMAZON_JP', 3), item('c', 'RAKUTEN_JP', 2)
  ], { now: NOW });
  assert.equal(result.together.length, 1);
  assert.equal(result.together[0].marketplace, 'AMAZON_JP');
  assert.deepEqual(result.together[0].usual_ids, ['a', 'b']);
  assert.equal(result.together[0].count, 2);
  assert.equal(result.together[0].earliest_due_at, due(1), '一番近い期限に合わせる');
  assert.deepEqual(result.alone, ['c'], 'まとめられなかったものは単独で残す');
});

test('モールが分からないものは寄せない', () => {
  const result = buyTogetherGroups([
    item('a', '', 1), item('b', '', 2)
  ], { now: NOW });
  assert.deepEqual(result.together, [], 'どこでまとめられるか言えない');
  assert.deepEqual(result.alone, ['a', 'b']);
});

test('7日より先のものは今週に入れない', () => {
  const result = buyTogetherGroups([
    item('a', 'AMAZON_JP', 1), item('b', 'AMAZON_JP', 30)
  ], { now: NOW });
  assert.deepEqual(result.together, []);
  assert.deepEqual(result.alone, ['a']);
});

test('止めたものは入れない', () => {
  const result = buyTogetherGroups([
    item('a', 'AMAZON_JP', 1), item('b', 'AMAZON_JP', 2, 'PAUSED')
  ], { now: NOW });
  assert.deepEqual(result.together, []);
  assert.deepEqual(result.alone, ['a']);
});

test('件数の多い順、同数なら期限が近い順', () => {
  const result = buyTogetherGroups([
    item('a', 'RAKUTEN_JP', 1), item('b', 'RAKUTEN_JP', 2),
    item('c', 'AMAZON_JP', 3), item('d', 'AMAZON_JP', 4), item('e', 'AMAZON_JP', 5)
  ], { now: NOW });
  assert.deepEqual(result.together.map((group) => group.marketplace), ['AMAZON_JP', 'RAKUTEN_JP']);
});

test('金額の話をしない', () => {
  const result = buyTogetherGroups([item('a', 'AMAZON_JP', 1), item('b', 'AMAZON_JP', 2)], { now: NOW });
  const json = JSON.stringify(result);
  for (const key of ['jpy', 'price', 'saving', 'shipping', '円']) {
    assert.ok(!json.toLowerCase().includes(key.toLowerCase()), key);
  }
});

test('一覧が buy_together を返す', () => {
  const source = read('src/member-usual.mjs');
  assert.match(source, /buy_together: buyTogetherGroups\(items, \{ days: 7 \}\),/u);
});

test('画面はサーバーのまとめ方をそのまま使う', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /result\.body\?\.buy_together\?\.together/u);
  assert.match(ui, /if \(members\.length < 2\) continue;/u);
  // 画面でまとめ直さない
  assert.ok(!/marketplace\]\s*=|groupBy/u.test(ui), '画面でまとめ直さない');
});

test('画面も節約額を言わない', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.ok(ui.includes('まとめて買えます'), 'まとめられることだけを言う');
  // 画面に出る文言（COPY）だけを見る。コメント行は説明なので外す。
  const copy = ui.slice(ui.indexOf('const COPY = {'), ui.indexOf('const PRESETS'))
    .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  for (const banned of ['送料', '節約', 'お得', '浮く', '安くなり']) {
    assert.ok(!copy.includes(banned), banned);
  }
});

test('スタイルがある（塗らずに線と文字だけ）', () => {
  const css = read('public/usual-hoshiru.css');
  assert.match(css, /\.usual-week-group\{/u);
  assert.ok(!/\.usual-week-group\{[^}]*box-shadow/u.test(css), '影は使わない');
});
