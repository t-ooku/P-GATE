// 2026-09-21 指示書 §35・§36「需要起点の営業」「Seller候補管理」（P1）。
// ・入れるのは公開されている事業者向けの情報だけ。ユーザーの個人情報は入れない
// ・人数は記録した時点の実数。作らない
// ・段階の日付は実際にそうなった時だけ。空は「まだ」であって 0 ではない
// ・行は消さない。降りた相手は DECLINED にして履歴を残す
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CANDIDATE_STAGES, CANDIDATE_STAGE_LABELS_JA, normalizeStage, normalizeCandidate,
  summarizeCandidates, handleSellerCandidateRoutes
} from '../src/seller-candidates.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('§36 の段階がそろっている', () => {
  assert.deepEqual([...CANDIDATE_STAGES], [
    'FOUND', 'CONTACTED', 'REPLIED', 'SIGNED_UP', 'PRODUCTS_LINKED', 'DMC_EARNED', 'PAID', 'DECLINED'
  ]);
  for (const stage of CANDIDATE_STAGES) assert.ok(CANDIDATE_STAGE_LABELS_JA[stage], stage);
});

test('知らない段階は受け取らない', () => {
  assert.equal(normalizeStage('PAID'), 'PAID');
  assert.equal(normalizeStage('paid'), 'PAID');
  assert.equal(normalizeStage('なんとなく'), '');
  assert.equal(normalizeStage(), '');
});

test('ショップ名が無ければ候補を作らない', () => {
  assert.equal(normalizeCandidate({}), null);
  assert.equal(normalizeCandidate({ shop_name: 'あ' }), null);
});

test('URL は https だけ。それ以外は空にする', () => {
  const candidate = normalizeCandidate({
    shop_name: 'かばんやさん',
    contact_url: 'http://example.com/contact',
    source_url: 'https://example.com/company',
    product_url: 'javascript:alert(1)'
  });
  assert.equal(candidate.contact_url, '', 'http は入れない');
  assert.equal(candidate.source_url, 'https://example.com/company');
  assert.equal(candidate.product_url, '');
});

test('人数は実数だけ。負の数や文字は 0 のまま', () => {
  assert.equal(normalizeCandidate({ shop_name: 'かばん堂', demand_people: 9 }).demand_people, 9);
  assert.equal(normalizeCandidate({ shop_name: 'かばん堂', demand_people: -3 }).demand_people, 0);
  assert.equal(normalizeCandidate({ shop_name: 'かばん堂', demand_people: 'たくさん' }).demand_people, 0);
});

test('最初の段階は FOUND', () => {
  assert.equal(normalizeCandidate({ shop_name: 'かばん堂' }).stage, 'FOUND');
  assert.equal(normalizeCandidate({ shop_name: 'かばん堂', stage: 'PAID' }).stage, 'PAID');
  assert.equal(normalizeCandidate({ shop_name: 'かばん堂', stage: 'でたらめ' }).stage, 'FOUND');
});

test('段階ごとの残件を数える。見送りは live から外す', () => {
  const summary = summarizeCandidates([
    { stage: 'FOUND' }, { stage: 'CONTACTED' }, { stage: 'CONTACTED' }, { stage: 'DECLINED' }
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.live, 3);
  assert.equal(summary.counts.CONTACTED, 2);
  assert.equal(summary.counts.PAID, 0);
});

test('数えられないときは 0 件と言わない', () => {
  assert.deepEqual(summarizeCandidates(null), { measurable: false });
  assert.deepEqual(summarizeCandidates(undefined), { measurable: false });
});

// --- ルート ---
const allow = async () => ({ mode: 'test' });
const deny = async () => null;
const url = (path = '') => `https://hoshilu.app/api/admin/seller-candidates${path}`;

test('他のルートは奪わない', async () => {
  assert.equal(await handleSellerCandidateRoutes(new Request('https://hoshilu.app/api/search'), {}, allow), null);
});

test('管理者以外は 401', async () => {
  const response = await handleSellerCandidateRoutes(new Request(url()), {}, deny);
  assert.equal(response.status, 401);
});

test('D1 が無ければ 503（0件とは言わない）', async () => {
  const response = await handleSellerCandidateRoutes(new Request(url()), {}, allow);
  assert.equal(response.status, 503);
});

test('表がまだ無いときは measurable:false', async () => {
  const env = { PRODUCT_DB: { prepare: () => ({ all: async () => { throw new Error('no such table: seller_candidates'); } }) } };
  const response = await handleSellerCandidateRoutes(new Request(url()), env, allow);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.measurable, false);
  assert.deepEqual(body.items, []);
});

test('ショップ名の無い POST は 400', async () => {
  const env = { PRODUCT_DB: { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) }) } };
  const response = await handleSellerCandidateRoutes(
    new Request(url(), { method: 'POST', body: '{}' }), env, allow);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'CANDIDATE_SHOP_NAME_REQUIRED');
});

test('二重登録は追加しない（duplicate として返す）', async () => {
  const env = { PRODUCT_DB: { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 0 } }) }) }) } };
  const response = await handleSellerCandidateRoutes(
    new Request(url(), { method: 'POST', body: JSON.stringify({ shop_name: 'かばんやさん', demand_key: 'k1' }) }),
    env, allow);
  const body = await response.json();
  assert.equal(body.added, false);
  assert.equal(body.duplicate, true);
});

test('更新するものが無ければ 400', async () => {
  const env = { PRODUCT_DB: { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) }) } };
  const response = await handleSellerCandidateRoutes(
    new Request(url('/00000000-0000-4000-8000-000000000000'), { method: 'PATCH', body: '{}' }), env, allow);
  assert.equal(response.status, 400);
});

test('段階を進めると、その段階の日付を初回だけ入れる', () => {
  const source = read('src/seller-candidates.mjs');
  assert.match(source, /CASE WHEN \$\{column\}='' THEN \?2 ELSE \$\{column\} END/u, '過去の日付を上書きしない');
  assert.match(source, /PAID: 'paid_at'/u);
});

test('行を消さない', () => {
  const source = read('src/seller-candidates.mjs');
  assert.ok(!/DELETE FROM/u.test(source), '候補は消さず DECLINED にする');
});

test('ユーザーの個人情報を持たない', () => {
  const schema = read('migrations/0086_seller_candidates.sql');
  for (const key of ['member_id', 'visitor_hash', 'session_id', 'email', 'phone']) {
    assert.ok(!schema.includes(key), key);
  }
  assert.match(schema, /CREATE TABLE IF NOT EXISTS seller_candidates/u);
  assert.match(schema, /idx_seller_candidates_unique ON seller_candidates\(demand_key, shop_name\)/u);
});

test('index.mjs が配線している', () => {
  const index = read('src/index.mjs');
  assert.match(index, /import \{ handleSellerCandidateRoutes \} from '\.\/seller-candidates\.mjs';/u);
  assert.match(index, /const sellerCandidateResponse = await handleSellerCandidateRoutes\(request, env\);/u);
});
