// 2026-09-21 指示書 §32〜§34「SNS・Web の販促を実需要から作る」（P1）。
// ・人数は実データのみ。公開できる需要が無ければ文面を作らない（§30 架空件数は禁止）
// ・数えられない系統からは文を作らない。0人と書かない
// ・自動投稿はしない。下書きを返すだけ（§54 不可逆な操作は承認が要る）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COPY_LIMITS, searchingCopy, usualCopy, priceWatchCopy, fitsPlatform,
  buildDemandSocialCopy, handleDemandSocialCopyRoute
} from '../src/demand-social-copy.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const searching = { items: [{ query: '黒 本革 A4トート', people: 9 }, { query: '子供用 水筒 800ml', people: 7 }] };
const usual = { measurable: true, items: [{ product_name: 'コーヒー豆 1kg', people: 31, within_7_days: 5, within_30_days: 12 }] };
const priceWatch = { measurable: true, items: [{ product_name: 'レノア 詰め替え 特大', people: 18, median_target_jpy: 1200 }] };

test('探し中の下書きは、実際の条件と人数だけを載せる', () => {
  const copy = searchingCopy(searching);
  assert.equal(copy.kind, 'SEARCHING');
  assert.ok(copy.body.includes('黒 本革 A4トート（9人）'));
  assert.ok(copy.body.includes('子供用 水筒 800ml（7人）'));
  assert.ok(copy.body.includes('https://hoshilu.app/for-sellers'));
});

test('いつものホシルは「7日以内に◯人」を出す', () => {
  const copy = usualCopy(usual);
  assert.ok(copy.body.includes('コーヒー豆 1kg（7日以内に5人）'));
});

test('値下がり待ちは中央値まで下げれば半数に届くと書く', () => {
  const copy = priceWatchCopy(priceWatch);
  assert.ok(copy.body.includes('レノア 詰め替え 特大（18人／中央値 ¥1,200）'));
  assert.ok(copy.body.includes('半数に届きます'));
});

test('数えられない系統からは文を作らない', () => {
  assert.equal(usualCopy({ measurable: false, items: [] }), null);
  assert.equal(priceWatchCopy({ measurable: false, items: [] }), null);
  assert.equal(searchingCopy(null), null);
});

test('公開できる需要が無ければ文を作らない（0人と書かない）', () => {
  assert.equal(searchingCopy({ items: [] }), null);
  assert.equal(usualCopy({ measurable: true, items: [{ product_name: 'A', people: 9, within_7_days: 0 }] }), null,
    '7日以内が0人なら「来週必要になりそう」とは言わない');
  assert.equal(priceWatchCopy({ measurable: true, items: [{ product_name: 'A', people: 9, median_target_jpy: 0 }] }), null);
});

test('名前が空の需要は載せない', () => {
  assert.equal(searchingCopy({ items: [{ query: '   ', people: 9 }] }), null);
  assert.equal(usualCopy({ measurable: true, items: [{ product_name: '', people: 9, within_7_days: 3 }] }), null);
});

test('媒体の字数に収まらない下書きは出さない', () => {
  assert.equal(COPY_LIMITS.X, 280);
  assert.equal(fitsPlatform('あ'.repeat(281), 'X'), false);
  assert.equal(fitsPlatform('あ'.repeat(280), 'X'), true);
  assert.equal(fitsPlatform('短い', 'LINE'), false, '知らない媒体には出さない');
});

test('収まる媒体だけを返す', () => {
  const long = { measurable: true, items: [{ product_name: 'あ'.repeat(60), people: 9, within_7_days: 3 }] };
  const drafts = buildDemandSocialCopy({ usual: long }, { platforms: ['X'] });
  const copy = usualCopy(long);
  assert.equal(drafts.length, fitsPlatform(copy.body, 'X') ? 1 : 0);
});

test('3系統ぶんの下書きを返す', () => {
  const drafts = buildDemandSocialCopy({ searching, priceWatch, usual });
  assert.deepEqual(drafts.map((draft) => draft.kind), ['SEARCHING', 'USUAL', 'PRICE_WATCH']);
  for (const draft of drafts) assert.ok(draft.platforms.length > 0);
});

test('何も無ければ下書きは0件', () => {
  assert.deepEqual(buildDemandSocialCopy({}), []);
});

test('個人情報を載せない', () => {
  const json = JSON.stringify(buildDemandSocialCopy({ searching, priceWatch, usual }));
  for (const key of ['member_id', 'visitor_hash', 'session_id', 'wish_id']) assert.ok(!json.includes(key), key);
});

// --- ルート ---
const allow = async () => ({ mode: 'test' });
const deny = async () => null;

test('他のルートは奪わない', async () => {
  assert.equal(await handleDemandSocialCopyRoute(new Request('https://hoshilu.app/api/search'), {}, allow), null);
});

test('管理者以外は 401、POST は 405', async () => {
  const anonymous = await handleDemandSocialCopyRoute(
    new Request('https://hoshilu.app/api/admin/demand-social-copy'), {}, deny);
  assert.equal(anonymous.status, 401);
  const post = await handleDemandSocialCopyRoute(
    new Request('https://hoshilu.app/api/admin/demand-social-copy', { method: 'POST' }), {}, allow);
  assert.equal(post.status, 405);
});

test('D1 が無くても落ちず、0件と断定しない', async () => {
  const response = await handleDemandSocialCopyRoute(
    new Request('https://hoshilu.app/api/admin/demand-social-copy'), {}, allow);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.drafts, []);
  assert.ok(body.note.includes('需要が0件という意味ではありません'));
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
});

test('このモジュールは投稿しない・書き込まない', () => {
  const source = read('src/demand-social-copy.mjs');
  assert.ok(!/INSERT INTO|UPDATE |DELETE FROM/u.test(source), '書き込まない');
  assert.ok(!source.includes('social_post_queue'), '投稿キューに入れない');
  assert.ok(!/fetch\(/u.test(source), '外部へ送らない');
});

test('index.mjs が配線している', () => {
  const index = read('src/index.mjs');
  assert.match(index, /import \{ handleDemandSocialCopyRoute \} from '\.\/demand-social-copy\.mjs';/u);
  assert.match(index, /const demandSocialCopyResponse = await handleDemandSocialCopyRoute\(request, env\);/u);
});
