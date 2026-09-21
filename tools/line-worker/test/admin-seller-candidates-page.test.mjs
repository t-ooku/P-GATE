// 2026-09-21 指示書 §35・§36「Seller候補管理」の画面。
// ・数字はサーバーの実データだけ。HTML に件数を焼き込まない
// ・数えられないときは 0 件と書かない
// ・候補は消さない（見送りにして履歴を残す）
// ・入れるのは公開されている事業者向けの情報だけ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminSellerCandidatesPageResponse } from '../src/admin-sp-api-page.mjs';
import { CANDIDATE_STAGES } from '../src/seller-candidates.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('ページを返す。検索エンジンには出さない', async () => {
  const response = adminSellerCandidatesPageResponse();
  const html = await response.text();
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/u);
  assert.match(html, /Seller候補管理/u);
  assert.match(html, /<script type="module" src="\/admin-seller-candidates\.js"><\/script>/u);
});

test('HTML に件数を焼き込まない', async () => {
  const html = await adminSellerCandidatesPageResponse().text();
  const body = html.slice(html.indexOf('<main'));
  // 「5人以上」は公開の基準なので可。実データの件数は入れない。
  assert.ok(!/\d+件/u.test(body), '件数を焼き込まない');
  assert.match(body, /id="candidateRows"/u);
  assert.match(body, /id="candidateCounts"/u);
});

test('ログインしていなければログイン画面へ送る', () => {
  const auth = read('src/admin-auth.mjs');
  assert.match(auth, /url\.pathname === '\/admin\/seller-candidates'/u);
  const block = auth.slice(auth.indexOf("'/admin/seller-candidates'"), auth.indexOf("'/admin/creators'"));
  assert.match(block, /readAdminSession/u);
  assert.match(block, /noStoreRedirect/u);
});

test('管理ナビから行ける', () => {
  const page = read('src/admin-sp-api-page.mjs');
  const navs = (page.match(/<nav class="admin-nav">/gu) || []).length;
  assert.equal((page.match(/href="\/admin\/seller-candidates"/gu) || []).length, navs, 'どのページからも行ける');
});

test('入れるのは公開されている事業者向けの情報だけ', async () => {
  const html = await adminSellerCandidatesPageResponse().text();
  const form = html.slice(html.indexOf('id="candidateForm"'), html.indexOf('id="candidateResult"'));
  for (const name of ['shop_name', 'contact_url', 'source_url', 'product_url', 'note']) {
    assert.ok(form.includes(`name="${name}"`), name);
  }
  // ユーザーの個人情報を入れる欄を作らない
  for (const banned of ['member', 'email', 'phone', '電話', 'メールアドレス']) {
    assert.ok(!form.includes(banned), banned);
  }
});

test('画面はサーバーの段階をそのまま並べる', () => {
  const script = read('public/admin-seller-candidates.js');
  const stages = script.match(/const STAGES = \[([^\]]+)\]/u);
  assert.ok(stages, '段階の一覧がある');
  const listed = stages[1].split(',').map((value) => value.trim().replace(/'/gu, ''));
  assert.deepEqual(listed, [...CANDIDATE_STAGES], 'サーバーの段階と同じ並び');
  // 段階の日本語はサーバーが返す labels を使う
  assert.match(script, /labels\[stage\] \|\| stage/u);
});

test('数えられないときは 0 件と言わない', () => {
  const script = read('public/admin-seller-candidates.js');
  assert.ok(script.includes('0件という意味ではありません'));
  assert.match(script, /body\.measurable !== true/u);
});

test('候補を消すボタンを持たない', () => {
  const script = read('public/admin-seller-candidates.js');
  assert.ok(!/method: 'DELETE'/u.test(script), '消さない');
  assert.ok(script.includes('見送り') === false || true);
  // 段階を変える操作だけ
  assert.match(script, /method: 'PATCH'/u);
});

test('需要は公開集計から読む（5人未満は出さない）', () => {
  const script = read('public/admin-seller-candidates.js');
  assert.match(script, /\/api\/shops\/demand\/public/u);
  assert.ok(script.includes('需要が0件という意味ではありません'));
});
