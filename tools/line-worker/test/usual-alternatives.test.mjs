// 2026-09-21 指示書 P2「同等品提案」。
// ここで守るのは1つだけ。**「同じ商品です」と言わないこと**。
// ・同一性を判定する材料を HOSHILU は持っていない
// ・だから「近い商品」として出し、一致した条件と **一致していない条件** を必ず両方添える
// ・探せなかったときは「近い商品が無い」と言わない（計測不能と区別する）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALTERNATIVE_LIMIT, alternativesFrom, handleUsualAlternativesRoute } from '../src/usual-alternatives.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const card = (over = {}) => ({
  name: '柔軟剤 詰替 大容量', image: 'https://img.example/1.jpg', url: 'https://hoshilu.app/shop/a/product/B0AAAAAAAA',
  asin: 'B0AAAAAAAA', shop: { slug: 'a', shop_name: 'かばん堂' }, marketplace: 'AMAZON_JP',
  matched: ['柔軟剤', '詰替'], unmatched: ['無香料'], ...over
});
const item = { usual_id: 'u1', product_key: 'B0SELFSELF', product_name: '柔軟剤 無香料 詰替', product_url: 'https://hoshilu.app/shop/a/product/B0SELFSELF' };

test('一致とちがいを必ず両方返す', () => {
  const rows = alternativesFrom({ exact: [card()], near: [] }, item);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].matched, ['柔軟剤', '詰替']);
  assert.deepEqual(rows[0].unmatched, ['無香料'], 'ちがいを隠さない');
});

test('元の商品そのものは「代わり」として出さない', () => {
  const byAsin = alternativesFrom({ exact: [card({ asin: 'B0SELFSELF' })], near: [] }, item);
  assert.deepEqual(byAsin, []);
  const byUrl = alternativesFrom({ exact: [card({ asin: '', url: item.product_url })], near: [] }, item);
  assert.deepEqual(byUrl, []);
});

test('ちがいが分からない候補は出さない（違いを言えないため）', () => {
  assert.deepEqual(alternativesFrom({ exact: [card({ unmatched: null })], near: [] }, item), []);
  assert.deepEqual(alternativesFrom({ exact: [card({ matched: null })], near: [] }, item), []);
});

test('一致が1つも無いものは「近い」とも言わない', () => {
  assert.deepEqual(alternativesFrom({ exact: [card({ matched: [] })], near: [] }, item), []);
});

test('同じ商品ページを二度出さない', () => {
  const rows = alternativesFrom({ exact: [card()], near: [card()] }, item);
  assert.equal(rows.length, 1);
});

test('出す件数に上限がある', () => {
  const many = Array.from({ length: 20 }, (_, index) => card({ url: `https://hoshilu.app/shop/a/product/B0AAAAAA${index}`, asin: '' }));
  assert.equal(alternativesFrom({ exact: many, near: [] }, item).length, ALTERNATIVE_LIMIT);
});

test('検索結果が無ければ空（作らない）', () => {
  assert.deepEqual(alternativesFrom(null, item), []);
  assert.deepEqual(alternativesFrom({}, item), []);
});

// --- ルート ---
const url = 'https://hoshilu.app/api/member/usual/0123456789abcdef0123456789abcdef/alternatives';
const memberEnv = (first) => ({ PRODUCT_DB: { prepare: () => ({ bind: () => ({ first }) }) }, __member: true });

// readMemberSession はセッション Cookie を見る。ここでは未ログインの経路だけ確かめる。
test('他のルートは奪わない', async () => {
  assert.equal(await handleUsualAlternativesRoute(new Request('https://hoshilu.app/api/member/usual'), {}), null);
  assert.equal(await handleUsualAlternativesRoute(new Request('https://hoshilu.app/api/member/usual/x/alternatives'), {}), null);
});

test('POST は 405、D1 が無ければ 503、未ログインは 401', async () => {
  assert.equal((await handleUsualAlternativesRoute(new Request(url, { method: 'POST' }), {})).status, 405);
  assert.equal((await handleUsualAlternativesRoute(new Request(url), {})).status, 503);
  assert.equal((await handleUsualAlternativesRoute(new Request(url), memberEnv(async () => null))).status, 401);
});

test('読み取りだけ（いつものを作り替えない）', () => {
  const source = read('src/usual-alternatives.mjs');
  assert.ok(!/INSERT INTO|UPDATE |DELETE FROM/u.test(source), '同等品提案は読むだけ');
});

test('「同じ商品」と言い切る文言をどこにも置かない', () => {
  const source = read('src/usual-alternatives.mjs');
  const ui = read('public/usual-hoshiru.mjs');
  for (const [label, text] of [['server', source], ['ui', ui]]) {
    const copy = text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.ok(!copy.includes('同じ商品です'), label);
    assert.ok(!copy.includes('同等品'), `${label}: 画面で「同等品」と断定しない`);
  }
  // サーバーの注意書きに「同じ商品とは限らない」と明記する
  assert.match(source, /同じ商品とは限りません/u);
});

test('探せなかったときは「無い」と言わずそう言う', () => {
  const source = read('src/usual-alternatives.mjs');
  assert.match(source, /measurable: false/u);
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /alternativesUnmeasurable/u);
  assert.match(ui, /近い商品が無いという意味ではありません/u);
});

test('画面は一致とちがいを両方描く', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /usual-alt-matched/u);
  assert.match(ui, /usual-alt-unmatched/u);
  assert.match(ui, /data\.note/u, 'サーバーの注意書きを出す');
});

test('index.mjs が配線している（いつもの一覧より先に判定する）', () => {
  const index = read('src/index.mjs');
  assert.match(index, /import \{ handleUsualAlternativesRoute \} from '\.\/usual-alternatives\.mjs';/u);
  const alt = index.indexOf('const alternativesResponse = await handleUsualAlternativesRoute(request, env);');
  const usual = index.indexOf('const usualResponse = await handleMemberUsualRoutes(request, env);');
  assert.ok(alt > 0 && usual > 0);
  assert.ok(alt < usual, '/api/member/usual 配下を先に取られないようにする');
});
