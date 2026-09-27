import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadsAmazonBoostPosts } from '../src/social-autopilot.mjs';
import { assertSellerMarketingCurrent } from '../src/seller-marketing-guard.mjs';

// 2026-09-27 大隆さん指示（Seller 1,980円・30日無料・開始前カード登録必須）:
// 夜枠のセラー募集は毎日キューへ種まきされる。公開時の検査で止まる文面を種まきしないこと。
// 以前 seller-start-flow に「開始時の支払い登録は不要です」が残り、新条件と矛盾していた。
test('Threads のセラー募集（日替わり全文面）は公開時の料金検査を通る', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-09-27T00:00:00Z'), 40)
    .filter((post) => /^seller-/u.test(post.content_id));
  const ids = new Set(posts.map((post) => post.content_id));
  assert.ok(ids.size >= 10, `日替わり文面が一巡していない: ${ids.size}`);
  for (const post of posts) {
    assert.doesNotThrow(() => assertSellerMarketingCurrent(post, {}), post.content_id);
    assert.match(post.caption, /1,980円/u, `${post.content_id}: 月額を書く`);
    assert.match(post.caption, /カード登録/u, `${post.content_id}: カード登録の条件を書く`);
    assert.match(post.caption, /自動更新/u, `${post.content_id}: 自動更新の条件を書く`);
    assert.doesNotMatch(post.caption, /値下げ|今だけ|永久/u, post.content_id);
  }
  // 旧文面は検査で止まる（検査側が効いていることの確認）
  assert.throws(() => assertSellerMarketingCurrent({ content_id: 'seller-start-flow', caption: '始め方は、掲載見本の相談 → 商品公開。開始時の支払い登録は不要です。' }, {}), /SUPERSEDED_AUTORENEW_COPY/u);
});
