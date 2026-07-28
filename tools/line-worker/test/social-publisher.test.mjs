import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSocialPost,
  publishSocialPost,
  socialPublisherReadiness
} from '../src/social-publisher.mjs';

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
