// 2026-09-21 大隆さん指示書「成長・収益化 統合実装」§2〜§11「いつものホシル」の中身を固定する。
// ・周期は本人の選択から始め、「買った！」の実績＝購入間隔の平均で更新する（§6）
// ・状態は4段階だけ。残量は入力させない（§7）
// ・事実データが揃わないときは判断を出さない（§8）
// ・価格は API 確認済みの実測値だけ。推定価格は混ぜない（主幹指示書）
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  usualCycleDays, nextDueAt, learnCycleDays, usualState, usualPriceJpy, usualBuyAdvice,
  dueWithinDays, USUAL_CYCLE_PRESETS_DAYS, USUAL_STATE_LABELS_JA
} from '../src/member-usual.mjs';

const DAY = 86_400_000;
const iso = (offsetDays, base = Date.UTC(2026, 8, 21)) => new Date(base + offsetDays * DAY).toISOString();

test('周期は 3〜365 日だけ受ける（指示書の 7/14/30/60 は全部通る）', () => {
  for (const days of USUAL_CYCLE_PRESETS_DAYS) assert.equal(usualCycleDays(days), days);
  assert.equal(usualCycleDays('30'), 30);
  assert.equal(usualCycleDays(2), 0);
  assert.equal(usualCycleDays(400), 0);
  assert.equal(usualCycleDays('abc'), 0);
  assert.equal(usualCycleDays(), 0);
});

test('次回の目安は 直近の購入日（無ければ登録日）+ 周期', () => {
  assert.equal(nextDueAt(30, { lastPurchasedAt: iso(0) }), iso(30));
  assert.equal(nextDueAt(30, { createdAt: iso(0) }), iso(30));
  // 購入日があれば登録日より優先する
  assert.equal(nextDueAt(30, { lastPurchasedAt: iso(10), createdAt: iso(0) }), iso(40));
  assert.equal(nextDueAt(0, { createdAt: iso(0) }), '');
  assert.equal(nextDueAt(30, {}), '');
});

test('§6 購入間隔の平均で周期を更新する（30→27→29→28 なら約29日）', () => {
  // 0日, 30日, 57日, 86日, 114日 → 間隔 30,27,29,28 → 平均 28.5 → 29
  const purchases = [iso(0), iso(30), iso(57), iso(86), iso(114)];
  const learned = learnCycleDays(purchases, 30);
  assert.equal(learned.cycle_days, 29);
  assert.equal(learned.cycle_source, 'LEARNED');
  assert.equal(learned.samples, 4);
});

test('§6 間隔が取れないうちは本人の選択を尊重する', () => {
  assert.deepEqual(learnCycleDays([], 30), { cycle_days: 30, cycle_source: 'CHOSEN', samples: 0 });
  assert.deepEqual(learnCycleDays([iso(0)], 14), { cycle_days: 14, cycle_source: 'CHOSEN', samples: 0 });
});

test('§6 極端な間隔は学習に使わない（連続購入で毎日通知にしない）', () => {
  // 1日しか空いていない間隔と、3年空いた間隔は捨てる
  const learned = learnCycleDays([iso(0), iso(1), iso(31), iso(61)], 30);
  assert.equal(learned.cycle_days, 30, '30日間隔 2本の平均');
  assert.equal(learned.samples, 2);
  assert.equal(learnCycleDays([iso(0), iso(1)], 14).cycle_source, 'CHOSEN', '使える間隔ゼロ');
});

test('§6 学習は直近 6 本の間隔だけ見る', () => {
  // 古い 60日間隔 × 3 のあと、最近 10日間隔 × 6
  const times = [0, 60, 120, 180, 190, 200, 210, 220, 230, 240];
  const learned = learnCycleDays(times.map((days) => iso(days)), 30);
  assert.equal(learned.samples, 6);
  assert.equal(learned.cycle_days, 10, '古い間隔に引きずられない');
});

test('§7 状態は4段階。周期に対する割合で決める', () => {
  const now = Date.UTC(2026, 8, 21);
  const due = (days) => new Date(now + days * DAY).toISOString();
  // 30日周期
  assert.equal(usualState(due(20), 30, now).state, 'PLENTY');
  assert.equal(usualState(due(6), 30, now).state, 'SOON', '指示書の例「洗剤 そろそろ｜あと6日くらい」');
  assert.equal(usualState(due(4), 30, now).state, 'NEARLY');
  assert.equal(usualState(due(1), 30, now).state, 'BUY_NOW');
  assert.equal(usualState(due(-3), 30, now).state, 'BUY_NOW', '過ぎていても BUY_NOW');
  // 7日周期では「あと6日」はまだ余裕
  assert.equal(usualState(due(6), 7, now).state, 'PLENTY');
  assert.equal(usualState(due(6), 30, now).days_left, 6);
});

test('§7 日本語ラベルは指示書どおり', () => {
  assert.deepEqual(USUAL_STATE_LABELS_JA, {
    PLENTY: 'まだ大丈夫', SOON: 'そろそろ', NEARLY: 'もうすぐ', BUY_NOW: '今ホシっとこ'
  });
});

test('状態は周期や日付が無ければ空（推測しない）', () => {
  assert.deepEqual(usualState('', 30), { state: '', days_left: null });
  assert.deepEqual(usualState(iso(5), 0), { state: '', days_left: null });
});

test('§9 いつもの価格は確認できた価格の中央値（特売1回で歪めない）', () => {
  assert.equal(usualPriceJpy([980, 1080, 1020, 998]), 1009);
  assert.equal(usualPriceJpy([980, 1020, 1000]), 1000);
  // 0・負数・数字でない値は混ぜない
  assert.equal(usualPriceJpy([0, -5, 'abc', 1000]), 1000);
  assert.equal(usualPriceJpy([]), null, '価格が1件も無ければ「計測不能」＝null');
  assert.equal(usualPriceJpy(), null);
});

test('§8 事実が揃わないときは判断を出さない', () => {
  assert.equal(usualBuyAdvice({ state: 'PLENTY', daysLeft: 20 }), null, '価格が無く、補充も先');
  assert.equal(usualBuyAdvice({ state: '', daysLeft: 3, currentPriceJpy: 900, usualPrice: 1000 }), null);
  assert.equal(usualBuyAdvice({ state: 'SOON', daysLeft: null }), null);
  assert.equal(usualBuyAdvice(), null);
});

test('§8 補充が迫っていれば価格が無くても買い時として伝える', () => {
  assert.deepEqual(usualBuyAdvice({ state: 'BUY_NOW', daysLeft: 1 }),
    { verdict: 'BUY_NOW', days_left: 1, price_difference_jpy: null });
  assert.deepEqual(usualBuyAdvice({ state: 'NEARLY', daysLeft: 4 }),
    { verdict: 'BUY_NOW', days_left: 4, price_difference_jpy: null });
});

test('§8 まだ先でも、いつもよりはっきり安ければ買い時（誤差は買い時にしない）', () => {
  assert.deepEqual(usualBuyAdvice({ state: 'PLENTY', daysLeft: 18, currentPriceJpy: 900, usualPrice: 1000 }),
    { verdict: 'BUY_NOW', days_left: 18, price_difference_jpy: 100 });
  assert.deepEqual(usualBuyAdvice({ state: 'PLENTY', daysLeft: 18, currentPriceJpy: 980, usualPrice: 1000 }),
    { verdict: 'WAIT', days_left: 18, price_difference_jpy: 20 }, '2% の差は誤差');
  assert.deepEqual(usualBuyAdvice({ state: 'PLENTY', daysLeft: 18, currentPriceJpy: 1100, usualPrice: 1000 }),
    { verdict: 'WAIT', days_left: 18, price_difference_jpy: -100 }, '今日は高め');
});

test('§11 今週の補充は 7日以内を近い順。止めたものは入れない', () => {
  const now = Date.UTC(2026, 8, 21);
  const at = (days) => new Date(now + days * DAY).toISOString();
  const items = [
    { product_name: 'トイレットペーパー', next_due_at: at(8), status: 'ACTIVE' },
    { product_name: '水', next_due_at: at(6), status: 'ACTIVE' },
    { product_name: '洗剤', next_due_at: at(4), status: 'ACTIVE' },
    { product_name: 'コーヒー', next_due_at: at(5), status: 'ACTIVE' },
    { product_name: '止めたもの', next_due_at: at(1), status: 'PAUSED' },
    { product_name: '日付なし', next_due_at: '', status: 'ACTIVE' }
  ];
  assert.deepEqual(dueWithinDays(items, 7, now).map((item) => item.product_name), ['洗剤', 'コーヒー', '水']);
  assert.deepEqual(dueWithinDays(items, 30, now).map((item) => item.product_name),
    ['洗剤', 'コーヒー', '水', 'トイレットペーパー']);
});

test('migration 0085 は別テーブルで、検索本文を持たない', () => {
  const sql = new URL('../migrations/0085_member_usual_items.sql', import.meta.url);
  const text = readFileSync(sql, 'utf8');
  assert.match(text, /CREATE TABLE IF NOT EXISTS member_usual_items/u);
  assert.match(text, /CREATE TABLE IF NOT EXISTS member_usual_purchases/u);
  assert.match(text, /idx_member_usual_demand/u, 'Seller 側の継続需要集計に索引が要る');
  assert.ok(!/query_text|session_id/u.test(text), 'プライバシー境界: 検索本文・検索単位IDを持たない');
});
