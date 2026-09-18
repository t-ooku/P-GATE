import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  SOCIAL_PLAN_V3, buildCarouselPosts, buildReelFallbackPosts, carouselSlotIndex, loadCarouselSets, policyV3Allows, reelFallbackAudience, seedCarouselQueue, seedReelFallbackQueue
} from '../src/social-weekly-plan-v3.mjs';
import { mediaUrlList, normalizeMediaUrls, normalizeSocialPost, publishSocialPost, socialPublisherTest } from '../src/social-publisher.mjs';

// 2026-09-17 大隆さん決定（SNS 方針 v3）: リール週 2 回（火・金、AI 女優 v1 の声付き新規生成）、
// カルーセル画像フィード週 3 回（月・水・土）、内容はユーザー向けとセラー向けを半々、X にも同日同内容。
const FORBIDDEN = /必ず|売上が上が|多数のユーザー|業界No|確実に|100%|最安|\d+%OFF|保証します/u;

test('方針 v3: 曜日・時刻・半々の順送り・禁止表現なし・画像は自サイトの決定的レンダリング', () => {
  assert.deepEqual([...SOCIAL_PLAN_V3.reel_weekdays], [2, 5]);
  assert.deepEqual([...SOCIAL_PLAN_V3.carousel_weekdays], [1, 3, 6]);
  const sets = loadCarouselSets();
  assert.equal(sets.order.length, 6);
  assert.equal(sets.order.filter((set) => set.audience === 'seller').length, 3);
  assert.deepEqual(sets.order.map((set) => set.audience), ['user', 'seller', 'user', 'seller', 'user', 'seller']);
  for (const set of sets.order) {
    assert.ok(set.slides.length >= 2 && set.slides.length <= 10, set.id);
    assert.doesNotMatch(JSON.stringify(set), FORBIDDEN, set.id);
    assert.ok(set.audience !== 'seller' || set.link_path === '/for-sellers', `${set.id} link`);
  }
  // 画像の台帳（manifest）はセットと枚数が一致する。画像本体は build-social-carousels.yml が生成してコミットする
  const manifest = JSON.parse(readFileSync(new URL('../public/social/carousel/manifest.json', import.meta.url), 'utf8'));
  for (const set of sets.order) {
    assert.equal(manifest.sets[set.id]?.slides, set.slides.length, set.id);
    assert.equal(manifest.sets[set.id]?.audience, set.audience);
  }
  assert.match(readFileSync(new URL('../scripts/build-social-carousels.py', import.meta.url), 'utf8'), /FORBIDDEN_CLAIM/u);
  assert.ok(existsSync(new URL('../../../.github/workflows/build-social-carousels.yml', import.meta.url)));
});

test('カルーセル投稿は月・水・土 20:00 JST に Instagram と X の同じ内容を、セットを順送りで作る', () => {
  const posts = buildCarouselPosts(new Date('2026-09-18T00:00:00.000Z'), 14);
  assert.equal(posts.length, 10);
  const days = [...new Set(posts.map((post) => post.jst_publish_date))];
  assert.deepEqual(days, ['2026-09-21', '2026-09-23', '2026-09-26', '2026-09-28', '2026-09-30']);
  const sixth = buildCarouselPosts(new Date('2026-09-18T00:00:00.000Z'), 16).filter((post) => post.jst_publish_date === '2026-10-03');
  assert.deepEqual(sixth.map((post) => post.content_id), ['carousel-seller-real-numbers', 'carousel-seller-real-numbers']);
  assert.ok(posts.every((post) => post.scheduled_at.endsWith('T11:00:00.000Z')));
  assert.ok(posts.every((post) => post.status === 'APPROVED' && post.content_format === 'IMAGE' && post.campaign_id === 'hoshilu-carousel-v3'));
  const ig = posts.filter((post) => post.platform === 'INSTAGRAM');
  const x = posts.filter((post) => post.platform === 'X');
  assert.equal(ig.length, 5);
  assert.deepEqual(ig.map((post) => post.content_id), [
    'carousel-user-hoshittoku-basics', 'carousel-seller-demand-visible', 'carousel-user-price-watch',
    'carousel-seller-shop-entrance', 'carousel-user-shop-search'
  ]);
  for (const [index, post] of ig.entries()) {
    assert.equal(x[index].content_id, post.content_id);
    assert.equal(x[index].crosspost_group_id, post.crosspost_group_id);
    assert.equal(mediaUrlList(post).length, 4);
    assert.ok(mediaUrlList(post).every((url) => url.startsWith('https://hoshilu.app/social/carousel/')));
    assert.match(post.link, /^https:\/\/hoshilu\.app\/(?:for-sellers)?\?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_carousel_v3&utm_content=/u);
    assert.match(x[index].link, /utm_source=x/u);
    assert.equal(post.media_url, '');
  }
  assert.equal(carouselSlotIndex({ year: 2026, month: 9, day: 22, weekday: 2 }), -1);
  assert.equal(carouselSlotIndex({ year: 2026, month: 10, day: 3, weekday: 6 }), 5);
  // 既に過ぎた枠は作らない
  assert.equal(buildCarouselPosts(new Date('2026-09-21T11:30:00.000Z'), 1).length, 0);
});

test('policyV3Allows: 9/21 以降は毎日 v2 女優・Instagram 静止画案内・リール日/カルーセル日の X 案内を投入しない', () => {
  const daily = { campaign_id: 'hoshilu-ai-actress-daily-v1', creative_policy: 'DAILY_AI_ACTRESS_22', platform: 'INSTAGRAM', scheduled_at: '2026-09-22T11:15:00.000Z', post_id: 'hoshilu-ai-actress-daily-v1-instagram-2026-09-22' };
  assert.equal(policyV3Allows(daily), false);
  assert.equal(policyV3Allows({ ...daily, scheduled_at: '2026-09-19T11:15:00.000Z' }), true, '適用開始前は旧方針のまま');
  const igGuide = { campaign_id: 'hoshilu-official-13mall-v2', platform: 'INSTAGRAM', scheduled_at: '2026-09-24T11:00:00.000Z', post_id: 'hoshilu-official-13mall-v2-instagram-guide-2026-09-24' };
  assert.equal(policyV3Allows(igGuide), false);
  const xTue = { campaign_id: 'hoshilu-official-13mall-v2', platform: 'X', scheduled_at: '2026-09-22T11:00:00.000Z', post_id: 'hoshilu-official-13mall-v2-x-guide-2026-09-22' };
  assert.equal(policyV3Allows(xTue), false);
  const xThu = { ...xTue, scheduled_at: '2026-09-24T11:00:00.000Z', post_id: 'hoshilu-official-13mall-v2-x-guide-2026-09-24' };
  assert.equal(policyV3Allows(xThu), true);
  assert.equal(policyV3Allows({ campaign_id: 'hoshilu-carousel-v3', platform: 'X', scheduled_at: '2026-09-21T11:00:00.000Z' }), true);
  assert.equal(policyV3Allows({ campaign_id: 'hoshilu-runway-video', platform: 'INSTAGRAM', scheduled_at: '2026-09-22T11:15:00.000Z' }), true);
  assert.equal(policyV3Allows({ campaign_id: 'hoshilu-threads-amazon-boost-v1', platform: 'THREADS', scheduled_at: '2026-09-22T00:30:00.000Z' }), true);
});

test('seedCarouselQueue は接続済み媒体の分だけ INSERT OR IGNORE し、既存行を書き換えない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true', INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token', INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: { prepare(sql) { assert.match(sql, /INSERT OR IGNORE INTO social_post_queue/u); assert.match(sql, /media_urls/u); return { bind(...values) { return { async run() { rows.push(values); return { meta: { changes: 1 } }; } }; } }; } }
  };
  const result = await seedCarouselQueue(env, new Date('2026-09-18T00:00:00.000Z'));
  assert.deepEqual(result, { enabled: true, planned: 5, inserted: 5 });
  assert.ok(rows.every((row) => row[1] === 'INSTAGRAM'));
  assert.deepEqual(JSON.parse(rows[0][6]).length, 4);
  assert.deepEqual(await seedCarouselQueue({ SOCIAL_AUTOPILOT_ENABLED: 'false' }), { enabled: false, planned: 0, inserted: 0 });
});

test('normalizeSocialPost は media_urls を自サイトの https だけに正規化する', () => {
  assert.equal(normalizeMediaUrls(''), '');
  assert.equal(normalizeMediaUrls('not json'), '');
  assert.equal(normalizeMediaUrls(['https://hoshilu.app/social/carousel/a/1.jpg', 'https://evil.example/2.jpg', 'http://hoshilu.app/x.jpg']), JSON.stringify(['https://hoshilu.app/social/carousel/a/1.jpg']));
  const post = normalizeSocialPost({ platform: 'X', caption: 'テスト', media_urls: ['https://hoshilu.app/social/carousel/a/1.jpg', 'https://hoshilu.app/social/carousel/a/2.jpg'], scheduled_at: '2026-09-21T11:00:00.000Z' });
  assert.deepEqual(mediaUrlList(post), ['https://hoshilu.app/social/carousel/a/1.jpg', 'https://hoshilu.app/social/carousel/a/2.jpg']);
});

test('Instagram は子コンテナ → CAROUSEL 親 → 公開の順で投稿し、親の creation_id を保存する', async () => {
  const calls = [];
  const created = [];
  const urls = [1, 2, 3, 4].map((n) => `https://hoshilu.app/social/carousel/user-hoshittoku-basics/${n}.jpg`);
  const id = await publishSocialPost({
    platform: 'INSTAGRAM', caption: '探さなくていい。ホシっといて。', link: 'https://hoshilu.app/',
    media_url: '', media_urls: urls, status: 'APPROVED'
  }, { INSTAGRAM_ACCESS_TOKEN: 'token', INSTAGRAM_ACCOUNT_ID: '123', INSTAGRAM_POLL_DELAY_MS: 0 }, async (url, options = {}) => {
    if (url.endsWith('/123/media')) {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      if (payload.is_carousel_item) return Response.json({ id: `child-${calls.length}` });
      return Response.json({ id: 'parent-1' });
    }
    if (url.includes('/parent-1?fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'ig-carousel-1' });
    return Response.json({}, { status: 404 });
  }, { onJobCreated: (value) => created.push(value) });
  assert.equal(id, 'ig-carousel-1');
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.slice(0, 4).map((c) => c.image_url), urls);
  assert.ok(calls.slice(0, 4).every((c) => c.is_carousel_item === true));
  assert.equal(calls[4].media_type, 'CAROUSEL');
  assert.deepEqual(calls[4].children, ['child-1', 'child-2', 'child-3', 'child-4']);
  assert.match(calls[4].caption, /@hoshilu\.app のプロフィールリンクから/u);
  assert.deepEqual(created, ['parent-1']);
  // 保存済みの親があれば子を作り直さない
  const again = [];
  const resumed = await publishSocialPost({
    platform: 'INSTAGRAM', caption: 'x', media_url: '', media_urls: urls, status: 'APPROVED', platform_job_id: 'parent-1'
  }, { INSTAGRAM_ACCESS_TOKEN: 'token', INSTAGRAM_ACCOUNT_ID: '123', INSTAGRAM_POLL_DELAY_MS: 0 }, async (url) => {
    again.push(url);
    if (url.includes('/parent-1?fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'ig-carousel-1' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(resumed, 'ig-carousel-1');
  assert.equal(again.filter((url) => url.endsWith('/123/media')).length, 0);
});

test('X はカルーセル画像を最大 4 枚 tweet_image としてアップロードし 1 投稿にまとめる', async () => {
  const inits = [];
  const mediaId = await socialPublisherTest.uploadXVideo(
    'https://hoshilu.app/social/carousel/user-hoshittoku-basics/1.jpg', 'x-token',
    { ASSETS: { async fetch() { return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }); } } },
    async (url, options = {}) => {
      if (String(url).endsWith('/initialize')) { inits.push(JSON.parse(options.body)); return Response.json({ data: { id: 'img-1' } }); }
      if (String(url).endsWith('/append')) return new Response(null, { status: 204 });
      if (String(url).endsWith('/finalize')) return Response.json({ data: {} });
      return Response.json({}, { status: 404 });
    }, 'image');
  assert.equal(mediaId, 'img-1');
  assert.equal(inits[0].media_category, 'tweet_image');
  assert.equal(inits[0].media_type, 'image/jpeg');
  // 動画以外の拡張子は静的画像として扱い、外部ホストは拒否する
  await assert.rejects(() => socialPublisherTest.uploadXVideo('https://evil.example/1.jpg', 'x', {}, async () => Response.json({}), 'image'), /X_MEDIA_URL_INVALID/u);
  const publisher = readFileSync(new URL('../src/social-publisher.mjs', import.meta.url), 'utf8');
  assert.match(publisher, /const imageUrls = mediaUrlList\(post\)\.slice\(0, 4\);/u);
  assert.match(publisher, /media: \{ media_ids: mediaId \}/u);
});

// 2026-09-18 大隆さん指示: AI リールが不合格でも SNS 運用を止めない。リール日（火・金）に 19:30 JST 時点で
// 承認済みリールが無ければ、同じ 20:15 JST 枠に静止画カルーセル（火=ユーザー向け、金=セラー向け）を入れる。
test('リール日の代替カルーセルは 19:30 JST 以降・リール未承認の時だけ、対象を合わせて 20:15 JST に入る', async () => {
  // 2026-09-18 は金曜（JST）。19:29 JST では何も出ない
  assert.deepEqual(buildReelFallbackPosts(new Date('2026-09-18T10:29:00.000Z')), []);
  const posts = buildReelFallbackPosts(new Date('2026-09-18T10:31:00.000Z'));
  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map((post) => post.platform), ['INSTAGRAM', 'X']);
  for (const post of posts) {
    assert.equal(post.scheduled_at, '2026-09-18T11:15:00.000Z');
    assert.equal(post.campaign_id, SOCIAL_PLAN_V3.campaign_id);
    assert.equal(post.content_format, 'IMAGE');
    assert.equal(post.jst_publish_date, '2026-09-18');
    assert.equal(post.crosspost_group_id, 'hoshilu-carousel-fallback-2026-09-18');
    assert.match(post.post_id, /^hoshilu-carousel-v3-fallback-(?:instagram|x)-2026-09-18$/u);
    assert.ok(mediaUrlList(post).length >= 2);
    assert.ok(policyV3Allows(post));
    const set = loadCarouselSets().order.find((item) => `carousel-${item.id}` === post.content_id);
    assert.equal(set.audience, 'seller', '金曜はセラー向け');
  }
  // 火曜（2026-09-22）はユーザー向け
  assert.equal(reelFallbackAudience(2), 'user');
  const tuesday = buildReelFallbackPosts(new Date('2026-09-22T10:45:00.000Z'));
  assert.equal(loadCarouselSets().order.find((item) => `carousel-${item.id}` === tuesday[0].content_id).audience, 'user');
  // 20:15 を過ぎたら入れない。カルーセル日（月曜）には出ない
  assert.deepEqual(buildReelFallbackPosts(new Date('2026-09-18T11:16:00.000Z')), []);
  assert.deepEqual(buildReelFallbackPosts(new Date('2026-09-21T10:45:00.000Z')), []);

  // 投入: リールが承認済みなら入れない。未承認なら接続済み媒体分だけ INSERT OR IGNORE
  const makeEnv = (reelCount) => {
    const rows = [];
    const env = {
      SOCIAL_AUTOPILOT_ENABLED: 'true', INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
      INSTAGRAM_ACCESS_TOKEN: 'ig-token', INSTAGRAM_ACCOUNT_ID: 'ig-account',
      PRODUCT_DB: { prepare(sql) {
        if (/SELECT COUNT\(\*\) AS n FROM social_post_queue/u.test(sql)) {
          assert.match(sql, /campaign_id=\?1 AND jst_publish_date=\?2/u);
          return { bind(campaign, date) { assert.equal(campaign, 'hoshilu-runway-video'); assert.equal(date, '2026-09-18'); return { async first() { return { n: reelCount }; } }; } };
        }
        assert.match(sql, /INSERT OR IGNORE INTO social_post_queue/u);
        return { bind(...values) { return { async run() { rows.push(values); return { meta: { changes: 1 } }; } }; } };
      } }
    };
    return { env, rows };
  };
  const ready = makeEnv(1);
  assert.deepEqual(await seedReelFallbackQueue(ready.env, new Date('2026-09-18T10:31:00.000Z')), { enabled: true, planned: 0, inserted: 0, reel_ready: true });
  assert.equal(ready.rows.length, 0);
  const missing = makeEnv(0);
  assert.deepEqual(await seedReelFallbackQueue(missing.env, new Date('2026-09-18T10:31:00.000Z')), { enabled: true, planned: 1, inserted: 1, reel_ready: false });
  assert.equal(missing.rows[0][0], 'hoshilu-carousel-v3-fallback-instagram-2026-09-18');
  assert.equal(missing.rows[0][7], '2026-09-18T11:15:00.000Z');
  assert.deepEqual(await seedReelFallbackQueue(makeEnv(0).env, new Date('2026-09-18T09:00:00.000Z')), { enabled: true, planned: 0, inserted: 0, reel_ready: false });
});
