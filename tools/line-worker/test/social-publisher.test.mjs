import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSocialPost,
  publishSocialPost,
  runDueSocialPosts,
  socialPublisherReadiness
} from '../src/social-publisher.mjs';

test('Instagram投稿はコメント誘導と若者向け必須ハッシュタグを公開前に補完する', () => {
  const post = normalizeSocialPost({ platform: 'INSTAGRAM', caption: '名前が分からなくても探せる', media_url: 'https://hoshilu.app/social/post.png', status: 'APPROVED' });
  assert.match(post.caption, /コメントで教えて/);
  for (const tag of ['#ホシル', '#あいまい検索', '#9モール横断', '#ほしっとく']) assert.match(post.caption, new RegExp(tag));
});

test('affiliate social posts always include disclosure', () => {
  const post = normalizeSocialPost({
    platform: 'X',
    caption: '名前の分からない欲しいをホシルで探そう。',
    link: 'https://hoshilu.app/?utm_source=x',
    affiliate: true
  });
  assert.match(post.caption, /アフィリエイト広告/);
});

test('unapproved posts can never be published', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'X',
    caption: 'TikTokで見た光るスマホケースを探してみた。',
    status: 'REVIEW_REQUIRED'
  }, { X_USER_ACCESS_TOKEN: 'token' }), /NOT_APPROVED/);
});

test('1件の公開失敗が同時刻の次の承認済み投稿を止めない', async () => {
  const rows = [
    { post_id: 'post-fails', platform: 'X', caption: 'first approved post', status: 'APPROVED', scheduled_at: '2026-07-30T02:00:00.000Z' },
    { post_id: 'post-succeeds', platform: 'X', caption: 'second approved post', status: 'APPROVED', scheduled_at: '2026-07-30T02:00:00.000Z' }
  ];
  const updates = [];
  const env = {
    X_USER_ACCESS_TOKEN: 'token',
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            if (sql.includes('SELECT * FROM social_post_queue')) {
              return { all: async () => ({ results: rows }) };
            }
            return {
              run: async () => {
                updates.push({ sql, values });
                return { meta: { changes: sql.includes("status='PUBLISHING'") ? 1 : 0 } };
              }
            };
          }
        };
      }
    }
  };
  let publishes = 0;
  const result = await runDueSocialPosts(env, new Date('2026-07-30T02:00:00.000Z'), async () => {
    publishes += 1;
    return publishes === 1
      ? Response.json({ title: 'Unauthorized' }, { status: 401 })
      : Response.json({ data: { id: 'published-second' } }, { status: 201 });
  });

  assert.deepEqual(result, { checked: 2, published: 1 });
  assert.equal(publishes, 2);
  assert.ok(updates.some((item) => item.sql.includes("status='FAILED'") && item.values[0] === 'post-fails'));
  assert.ok(updates.some((item) => item.sql.includes("status='PUBLISHED'") && item.values[0] === 'post-succeeds'));
});

test('publisher readiness requires platform credentials and TikTok audit', () => {
  assert.deepEqual(socialPublisherReadiness({
    X_USER_ACCESS_TOKEN: 'x',
    INSTAGRAM_ACCESS_TOKEN: 'ig',
    INSTAGRAM_ACCOUNT_ID: '1',
    TIKTOK_ACCESS_TOKEN: 'tt',
    TIKTOK_APP_AUDITED: 'false'
  }), { X: true, INSTAGRAM: true, TIKTOK: false });
  assert.equal(socialPublisherReadiness({
    X_API_KEY: 'key',
    X_API_SECRET: 'secret',
    X_ACCESS_TOKEN: 'token',
    X_ACCESS_TOKEN_SECRET: 'token-secret'
  }).X, true);
});

test('X publisher uses official create-post endpoint after approval', async () => {
  let request;
  const id = await publishSocialPost({
    platform: 'X',
    caption: '曖昧な欲しいを検索語に変える。',
    link: 'https://hoshilu.app/?utm_source=x',
    status: 'APPROVED'
  }, { X_USER_ACCESS_TOKEN: 'token' }, async (url, options) => {
    request = { url, options };
    return Response.json({ data: { id: 'post-1' } }, { status: 201 });
  });
  assert.equal(id, 'post-1');
  assert.equal(request.url, 'https://api.x.com/2/tweets');
  assert.match(request.options.headers.authorization, /^Bearer /);
});

test('social links percent-encode the complete Japanese search query', async () => {
  let postedText = '';
  await publishSocialPost({
    platform: 'X',
    caption: 'HOSHILU search example',
    link: 'https://hoshilu.app/?q=TikTokで見た光るスマホケース&utm_source=x',
    status: 'APPROVED'
  }, { X_USER_ACCESS_TOKEN: 'token' }, async (_url, options) => {
    postedText = JSON.parse(options.body).text;
    return Response.json({ data: { id: 'post-encoded-link' } }, { status: 201 });
  });
  const postedLink = postedText.split('\n').at(-1);
  assert.equal(postedLink.includes(' '), false);
  assert.equal(new URL(postedLink).searchParams.get('q'), 'TikTokで見た光るスマホケース');
});

test('X publisher supports long-lived OAuth 1.0a user credentials', async () => {
  let authorization = '';
  await publishSocialPost({
    platform: 'X',
    caption: 'HOSHILUの検索例を投稿します。',
    status: 'APPROVED'
  }, {
    X_API_KEY: 'consumer-key',
    X_API_SECRET: 'consumer-secret',
    X_ACCESS_TOKEN: 'access-token',
    X_ACCESS_TOKEN_SECRET: 'access-secret'
  }, async (_url, options) => {
    authorization = options.headers.authorization;
    return Response.json({ data: { id: 'post-oauth1' } }, { status: 201 });
  });
  assert.match(authorization, /^OAuth /);
  assert.match(authorization, /oauth_signature=/);
  assert.match(authorization, /oauth_token="access-token"/);
});

test('X publisher prefers OAuth 1.0a when a stale bearer token is also configured', async () => {
  let authorization = '';
  await publishSocialPost({
    platform: 'X',
    caption: 'HOSHILUの予約投稿です。',
    status: 'APPROVED'
  }, {
    X_USER_ACCESS_TOKEN: 'stale-bearer',
    X_API_KEY: 'consumer-key',
    X_API_SECRET: 'consumer-secret',
    X_ACCESS_TOKEN: 'access-token',
    X_ACCESS_TOKEN_SECRET: 'access-secret'
  }, async (_url, options) => {
    authorization = options.headers.authorization;
    return Response.json({ data: { id: 'post-oauth1-preferred' } }, { status: 201 });
  });
  assert.match(authorization, /^OAuth /);
  assert.doesNotMatch(authorization, /^Bearer /);
});

test('Instagram publisher waits for media processing before publishing', async () => {
  const requests = [];
  const id = await publishSocialPost({
    platform: 'INSTAGRAM',
    caption: 'HOSHILU launch post',
    link: 'https://hoshilu.app/',
    media_url: 'https://hoshilu.app/social/instagram-launch-v1.png',
    status: 'APPROVED'
  }, {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url) => {
    requests.push(url);
    if (url.endsWith('/123/media')) return Response.json({ id: 'container-1' });
    if (url.includes('/container-1?fields=status_code')) {
      const checks = requests.filter(value => value.includes('/container-1?fields=status_code')).length;
      return Response.json({ status_code: checks === 1 ? 'IN_PROGRESS' : 'FINISHED' });
    }
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'ig-post-1' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'ig-post-1');
  assert.equal(requests.filter(value => value.includes('status_code')).length, 2);
  assert.match(requests.at(-1), /media_publish$/);
});

test('Instagramリールの処理が10回を超えても完了まで待機する', async () => {
  let checks = 0;
  const id = await publishSocialPost({
    platform: 'INSTAGRAM',
    caption: 'HOSHILU reel retry',
    media_url: 'https://hoshilu.app/social/cross-market-reel.mp4',
    status: 'APPROVED'
  }, {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url) => {
    if (url.endsWith('/123/media')) return Response.json({ id: 'slow-reel-container' });
    if (url.includes('/slow-reel-container?fields=status_code')) {
      checks += 1;
      return Response.json({ status_code: checks < 12 ? 'IN_PROGRESS' : 'FINISHED' });
    }
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'slow-ig-reel' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'slow-ig-reel');
  assert.equal(checks, 12);
});

test('Instagram再試行は保存済みコンテナを再利用して重複作成しない', async () => {
  let creates = 0;
  const id = await publishSocialPost({
    platform: 'INSTAGRAM',
    caption: 'HOSHILU reel resume',
    media_url: 'https://hoshilu.app/social/cross-market-reel.mp4',
    platform_job_id: 'existing-container',
    status: 'APPROVED'
  }, {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url) => {
    if (url.endsWith('/123/media')) {
      creates += 1;
      return Response.json({ id: 'unexpected-container' });
    }
    if (url.includes('/existing-container?fields=status_code')) {
      return Response.json({ status_code: 'FINISHED' });
    }
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'resumed-reel' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'resumed-reel');
  assert.equal(creates, 0);
});

test('Instagram publisher creates a Reels container for an MP4 media URL', async () => {
  let createPayload;
  const id = await publishSocialPost({
    platform: 'INSTAGRAM',
    caption: 'HOSHILU reel post',
    link: 'https://hoshilu.app/',
    media_url: 'https://hoshilu.app/social/cross-market-reel.mp4?version=1',
    status: 'APPROVED'
  }, {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url, options = {}) => {
    if (url.endsWith('/123/media')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'reel-container-1' });
    }
    if (url.includes('/reel-container-1?fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'ig-reel-1' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'ig-reel-1');
  assert.equal(createPayload.media_type, 'REELS');
  assert.equal(createPayload.video_url, 'https://hoshilu.app/social/cross-market-reel.mp4?version=1');
  assert.equal(createPayload.share_to_feed, true);
  assert.equal('image_url' in createPayload, false);
  assert.match(createPayload.caption, /#9モール横断/);
});

test('Instagram publisher creates a Stories container when content id is marked as a story', async () => {
  let createPayload;
  const id = await publishSocialPost({
    platform: 'INSTAGRAM',
    content_id: 'daily_story_poll',
    caption: '今日の検索クイズです',
    media_url: 'https://hoshilu.app/social/instagram-want-poll-v1.png',
    status: 'APPROVED'
  }, {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url, options = {}) => {
    if (url.endsWith('/123/media')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'story-container-1' });
    }
    if (url.includes('/story-container-1?fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'ig-story-1' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'ig-story-1');
  assert.deepEqual(createPayload, {
    media_type: 'STORIES',
    image_url: 'https://hoshilu.app/social/instagram-want-poll-v1.png'
  });
});
