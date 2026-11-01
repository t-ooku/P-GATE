import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadsAmazonBoostPosts } from '../src/social-autopilot.mjs';
import { assertSellerMarketingCurrent } from '../src/seller-marketing-guard.mjs';

// 2026-09-27 大隆さん指示（Seller 1,980円・30日無料・開始前カード登録必須）で始めた夜枠のセラー募集。
// 2026-11-01 大隆さん「合っていないのは消していい」: 入口は「無料の見本掲載 30 日（カード登録なし）」（10/24 承認）に変わったので、
// 旧入口の前置き（商品公開から30日間無料・カード登録必須・31日目から自動更新）と、旧条件を説明する 2 本を外した。
test('Threads のセラー募集（日替わり全文面）は旧入口の条件を書かず、公開時の検査を通る', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-11-01T00:00:00Z'), 40)
    .filter((post) => /^seller-/u.test(post.content_id));
  const ids = new Set(posts.map((post) => post.content_id));
  assert.ok(ids.size >= 8, `日替わり文面が一巡していない: ${ids.size}`);
  assert.ok(!ids.has('seller-price-plain') && !ids.has('seller-start-flow'), '旧条件を説明する 2 本は外した');
  for (const post of posts) {
    assert.doesNotThrow(() => assertSellerMarketingCurrent(post, {}), post.content_id);
    assert.doesNotMatch(post.caption, /カード登録必須|31日目から|商品公開から30日間無料/u, post.content_id);
    assert.doesNotMatch(post.caption, /値下げ|今だけ|永久/u, post.content_id);
  }
  // 旧文面は検査で止まる（検査側が効いていることの確認）
  assert.throws(() => assertSellerMarketingCurrent({ content_id: 'seller-start-flow', caption: '始め方は、掲載見本の相談 → 商品公開。開始時の支払い登録は不要です。' }, {}), /SUPERSEDED_AUTORENEW_COPY/u);
  assert.throws(() => assertSellerMarketingCurrent({ platform: 'THREADS', content_id: 'seller-x', caption: '新規Sellerは商品公開から30日間無料。（体験開始は準備中）開始前にカード登録必須。' }, {}), /SUPERSEDED_ENTRY_COPY/u);
});

// 2026-11-01: セラー向けカルーセル 7 セットは画像に旧条件が焼き込まれているので、11/1 からは出さない（ユーザー向けだけを順送り）。
// 旧セットの行が残っていても、公開時の検査で止まる。
test('11/1 からカルーセルはユーザー向けだけ。旧セラー向けセットの本文は公開時の検査で止まる', async () => {
  const { buildCarouselPosts } = await import('../src/social-weekly-plan-v3.mjs');
  const posts = buildCarouselPosts(new Date('2026-11-01T00:00:00Z'), 60);
  assert.ok(posts.length > 0);
  assert.ok(posts.every((post) => /carousel-user-/u.test(post.content_id)), 'セラー向けセットが残っている');
  for (const post of posts) assert.doesNotThrow(() => assertSellerMarketingCurrent(post, {}), post.post_id);
  const old = buildCarouselPosts(new Date('2026-09-27T00:00:00Z'), 30).filter((post) => /carousel-seller-/u.test(post.content_id));
  assert.ok(old.length > 0);
  for (const post of old) assert.throws(() => assertSellerMarketingCurrent(post, {}), /SELLER_MARKETING_REVIEW_REQUIRED/u, post.post_id);
  // 買い物客向けは従来どおり
  const user = posts.find((post) => post.platform === 'INSTAGRAM');
  assert.match(user.caption, /コメントで教えて|プロフィールのリンク/u);
});

