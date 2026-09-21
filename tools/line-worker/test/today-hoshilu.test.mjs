// 2026-09-21 指示書 §37「今日のHOSHILU」・§38「通知を乱発しない」（P1）。
// ・緊急なものだけ即時。それ以外は1日1回まとめる
// ・中身は保存済みの事実だけ。無いものを作らない
// ・何も無い日は、何も無いとだけ言う
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  URGENT_EVENT_TYPES, DIGEST_EVENT_TYPES, shouldSendImmediately, digestDue,
  usualSection, priceSection, matchedSection, buildTodaysHoshilu, handleMemberTodayRoute
} from '../src/today-hoshilu.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const DAY = 86_400_000;
const NOW = Date.parse('2026-09-21T12:00:00Z');

test('§38 即時に出すのは「今動かないと逃すこと」だけ', () => {
  // PRICE_OFFER_MATCH も「希望価格に届いた」と同じ意味なので即時（P2 匿名需要オファー）
  assert.deepEqual([...URGENT_EVENT_TYPES], ['TARGET_PRICE_REACHED', 'SHOP_DEMAND_MATCH', 'PRICE_OFFER_MATCH']);
  for (const type of URGENT_EVENT_TYPES) assert.equal(shouldSendImmediately(type), true, type);
  for (const type of DIGEST_EVENT_TYPES) {
    assert.equal(shouldSendImmediately(type), false, `${type} はまとめる`);
  }
  assert.equal(shouldSendImmediately(''), false);
  assert.equal(shouldSendImmediately('なにか知らないもの'), false, '知らないものは押し出さない');
});

test('§38 まとめは1日1回（JST の暦日で見る）', () => {
  assert.equal(digestDue('', NOW), true, 'まだ出していなければ出す');
  assert.equal(digestDue('2026-09-21T03:00:00Z', NOW), false, '同じ日には2通目を出さない');
  assert.equal(digestDue('2026-09-20T12:00:00Z', NOW), true);
  // JST の日付境界: 9/20 15:00Z は JST では 9/21
  assert.equal(digestDue('2026-09-20T15:30:00Z', NOW), false);
});

// --- 中身 ---
const usualItems = [
  { usual_id: 'a', product_name: '柔軟剤', cycle_days: 30, next_due_at: new Date(NOW + 2 * DAY).toISOString(), status: 'ACTIVE' },
  { usual_id: 'b', product_name: 'コーヒー豆', cycle_days: 30, next_due_at: new Date(NOW + 25 * DAY).toISOString(), status: 'ACTIVE' },
  { usual_id: 'c', product_name: '止めたもの', cycle_days: 30, next_due_at: new Date(NOW).toISOString(), status: 'PAUSED' }
];

test('補充は「そろそろ」以降だけ、近い順', () => {
  const rows = usualSection(usualItems, NOW);
  assert.equal(rows.length, 1, 'まだ先のものと止めたものは入れない');
  assert.equal(rows[0].product_name, '柔軟剤');
  assert.equal(rows[0].days_left, 2);
  assert.ok(rows[0].state_label, '状態の文言はサーバーが付ける');
});

test('値下がりは、実測できた価格が希望価格以下のものだけ', () => {
  const rows = priceSection([
    { wish_id: '1', target_product_name: 'A', target_price_jpy: 1200, last_price_jpy: 980 },
    { wish_id: '2', target_product_name: 'B', target_price_jpy: 1200, last_price_jpy: 1500 },
    { wish_id: '3', target_product_name: 'C', target_price_jpy: 1200, last_price_jpy: null },
    { wish_id: '4', target_product_name: 'D', target_price_jpy: 0, last_price_jpy: 100 }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].wish_id, '1');
  assert.equal(rows[0].difference_jpy, 220);
});

test('観測できていない商品について「下がっていない」とも言わない', () => {
  const rows = priceSection([{ wish_id: '3', target_price_jpy: 1200, last_price_jpy: null }]);
  assert.deepEqual(rows, []);
});

test('探し中の一致は直近24時間だけ', () => {
  const rows = matchedSection([
    { demand_id: 'x', query_text: '黒 トート', matched_at: new Date(NOW - 3600_000).toISOString(), matched_level: 'EXACT' },
    { demand_id: 'y', query_text: '古いもの', matched_at: new Date(NOW - 3 * DAY).toISOString(), matched_level: 'EXACT' },
    { demand_id: 'z', query_text: '日付なし', matched_at: '', matched_level: 'EXACT' }
  ], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].demand_id, 'x');
});

test('何も無い日は節を1つも作らない', () => {
  const today = buildTodaysHoshilu({ now: NOW });
  assert.deepEqual(today.sections, []);
  assert.equal(today.total, 0);
});

test('あるものだけ並べる', () => {
  const today = buildTodaysHoshilu({
    usual: usualItems,
    wishes: [{ wish_id: '1', target_product_name: 'A', target_price_jpy: 1200, last_price_jpy: 980 }],
    demands: [{ demand_id: 'x', query_text: '黒 トート', matched_at: new Date(NOW - 3600_000).toISOString(), matched_level: 'EXACT' }],
    now: NOW
  });
  assert.deepEqual(today.sections.map((section) => section.kind), ['USUAL', 'PRICE', 'MATCHED']);
  assert.equal(today.total, 3);
});

test('個人情報を返さない', () => {
  const json = JSON.stringify(buildTodaysHoshilu({ usual: usualItems, now: NOW }));
  for (const key of ['member_id', 'visitor_hash', 'session_id']) assert.ok(!json.includes(key), key);
});

// --- ルート ---
test('他のルートは奪わない', async () => {
  assert.equal(await handleMemberTodayRoute(new Request('https://hoshilu.app/api/member/usual'), {}), null);
});

test('POST は 405、D1 が無ければ 503', async () => {
  const post = await handleMemberTodayRoute(new Request('https://hoshilu.app/api/member/today', { method: 'POST' }), {});
  assert.equal(post.status, 405);
  const noDb = await handleMemberTodayRoute(new Request('https://hoshilu.app/api/member/today'), {});
  assert.equal(noDb.status, 503);
});

test('読み取り専用（このモジュールは書き込まない）', () => {
  const source = read('src/today-hoshilu.mjs');
  assert.ok(!/INSERT INTO|UPDATE |DELETE FROM/u.test(source), '今日のホシルは読むだけ');
});

test('index.mjs が配線している', () => {
  const index = read('src/index.mjs');
  assert.match(index, /import \{ handleMemberTodayRoute \} from '\.\/today-hoshilu\.mjs';/u);
  assert.match(index, /const todayResponse = await handleMemberTodayRoute\(request, env\);/u);
});

test('画面はサーバーの文言と数字をそのまま出す', () => {
  const ui = read('public/today-hoshilu.mjs');
  assert.match(ui, /item\.state_label/u);
  assert.match(ui, /section\.title/u);
  assert.ok(!ui.includes('そろそろ補充'), '節の見出しを画面に複製しない');
  assert.match(ui, /root\.hidden = true/u, '未ログイン・失敗時は黙って畳む');
  assert.match(ui, /COPY\.empty/u, '何も無い日はそう言う');
});

test('ホシル中の一番上に置く', () => {
  const html = read('public/index.html');
  const today = html.indexOf('id="todayHoshilu"');
  assert.ok(today > 0);
  assert.ok(today < html.indexOf('id="entrustedWatches"'), '値下がり待ちより前');
  assert.ok(today < html.indexOf('id="usualHoshiru"'), 'いつものホシルより前');
  assert.match(html, /<div id="todayHoshilu"[^>]*hidden>/u, '中身が来るまで出さない');
});
