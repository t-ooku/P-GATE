import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSocialPost,
  publishSocialPost,
  runDueSocialPosts,
  socialPublisherReadiness,
  xPublishingSafetyReadiness,
  syncInstagramPublishedPermalinks,
  handleSocialAdminRoutes
} from '../src/social-publisher.mjs';

const X_EXPECTED_USERNAME = 'HOSHILUOfficial';

function xBearerEnv(overrides = {}) {
  return {
    X_USER_ACCESS_TOKEN: 'token',
    X_PUBLISHING_ENABLED: 'true',
    X_EXPECTED_USERNAME,
    ...overrides
  };
}

test('Instagram投稿はコメント誘導と若者向け必須ハッシュタグを公開前に補完する', () => {
  const post = normalizeSocialPost({ platform: 'INSTAGRAM', caption: '名前が分からなくても探せる', media_url: 'https://hoshilu.app/social/post.png', status: 'APPROVED' });
  assert.match(post.caption, /コメントで教えて/);
  for (const tag of ['#ホシル', '#あいまい検索', '#13モール横断', '#ほしっとく']) assert.match(post.caption, new RegExp(tag));
});

test('Threads投稿は240文字超・400文字以下まで許可し、400文字を超える分は切り詰める', () => {
  const longCaption = 'ホ'.repeat(450);
  const post = normalizeSocialPost({ platform: 'THREADS', caption: longCaption, status: 'APPROVED' });
  assert.equal(post.caption.length, 400);
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

test('HOSHILUとITG Amazon店舗の所有主体を混同する投稿を拒否する', () => {
  assert.throws(() => normalizeSocialPost({
    platform: 'X',
    caption: 'ITGグループ株式会社が運営するHOSHILUです。'
  }), /SOCIAL_ENTITY_CLAIM_INVALID/);
  assert.throws(() => normalizeSocialPost({
    platform: 'X',
    caption: 'HOSHILUはITGグループ株式会社が所有しています。'
  }), /SOCIAL_ENTITY_CLAIM_INVALID/);

  const valid = normalizeSocialPost({
    platform: 'X',
    caption: 'with care・Find fun・Tomorrow\'s smileはITGグループ株式会社が運営するAmazon.co.jp店舗です。HOSHILUで商品を探せます。'
  });
  assert.match(valid.caption, /ITGグループ株式会社/);
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
    X_PUBLISHING_ENABLED: 'true',
    X_EXPECTED_USERNAME,
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
  const result = await runDueSocialPosts(env, new Date('2026-07-30T02:00:00.000Z'), async (url) => {
    if (url.endsWith('/2/users/me')) {
      return Response.json({ data: { username: X_EXPECTED_USERNAME } });
    }
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

test('X公開停止中は既存APPROVED行をclaimもFAILED化もしない', async () => {
  const rows = [{
    post_id: 'paused-x-post', platform: 'X', caption: 'approved but paused',
    status: 'APPROVED', scheduled_at: '2026-08-14T11:00:00.000Z'
  }];
  const updates = [];
  let publishes = 0;
  const env = {
    X_USER_ACCESS_TOKEN: 'configured-but-disabled',
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            if (sql.includes('SELECT * FROM social_post_queue')) {
              assert.equal(values[1], 0);
              return { all: async () => ({ results: rows }) };
            }
            return {
              run: async () => {
                updates.push({ sql, values });
                return { meta: { changes: 0 } };
              }
            };
          }
        };
      }
    }
  };
  const result = await runDueSocialPosts(env, new Date('2026-08-14T11:00:00.000Z'), async () => {
    publishes += 1;
    return Response.json({ data: { id: 'must-not-publish' } });
  });
  assert.deepEqual(result, { checked: 0, published: 0 });
  assert.equal(publishes, 0);
  assert.equal(updates.some(item => item.sql.includes("SET status='PUBLISHING'")), false);
  assert.equal(updates.some(item => item.sql.includes("SET status='FAILED'")
    && item.values[0] === 'paused-x-post'), false);
});

test('publisher readiness requires platform credentials and TikTok audit', () => {
  assert.deepEqual(socialPublisherReadiness({
    X_USER_ACCESS_TOKEN: 'x',
    INSTAGRAM_ACCESS_TOKEN: 'ig',
    INSTAGRAM_ACCOUNT_ID: '1',
    TIKTOK_ACCESS_TOKEN: 'tt',
    TIKTOK_APP_AUDITED: 'false'
  }), { X: true, INSTAGRAM: true, TIKTOK: false, THREADS: false });
  assert.equal(socialPublisherReadiness({}).THREADS, false);
  assert.equal(socialPublisherReadiness({ THREADS_ACCESS_TOKEN: 'token' }).THREADS, false);
  assert.equal(socialPublisherReadiness({ THREADS_USER_ID: '123' }).THREADS, false);
  assert.equal(socialPublisherReadiness({
    THREADS_ACCESS_TOKEN: 'token',
    THREADS_USER_ID: '123'
  }).THREADS, true);
  assert.equal(socialPublisherReadiness({
    X_API_KEY: 'key',
    X_API_SECRET: 'secret',
    X_ACCESS_TOKEN: 'token',
    X_ACCESS_TOKEN_SECRET: 'token-secret'
  }).X, true);
  assert.deepEqual(xPublishingSafetyReadiness({ X_USER_ACCESS_TOKEN: 'x' }), {
    enabled: false,
    expectedUsernameConfigured: false,
    expectedUsernameValid: false,
    ready: false
  });
});

test('X credentials alone remain visible to health but cannot publish without explicit opt-in', async () => {
  let requests = 0;
  const env = { X_USER_ACCESS_TOKEN: 'token' };
  assert.equal(socialPublisherReadiness(env).X, true);
  await assert.rejects(() => publishSocialPost({
    platform: 'X',
    caption: 'HOSHILUの安全な予約投稿です。',
    status: 'APPROVED'
  }, env, async () => {
    requests += 1;
    return Response.json({});
  }), /X_PUBLISHING_DISABLED/);
  assert.equal(requests, 0);
});

test('X publishing requires an explicit expected username before any API request', async () => {
  let requests = 0;
  await assert.rejects(() => publishSocialPost({
    platform: 'X',
    caption: 'HOSHILUの安全な予約投稿です。',
    status: 'APPROVED'
  }, {
    X_USER_ACCESS_TOKEN: 'token',
    X_PUBLISHING_ENABLED: 'true'
  }, async () => {
    requests += 1;
    return Response.json({});
  }), /X_EXPECTED_USERNAME_REQUIRED/);
  assert.equal(requests, 0);
});

test('X publisher refuses an authenticated account whose username is not the expected account', async () => {
  const requests = [];
  await assert.rejects(() => publishSocialPost({
    platform: 'X',
    caption: 'HOSHILUの対象アカウントを確認します。',
    status: 'APPROVED'
  }, xBearerEnv(), async (url, options) => {
    requests.push({ url, options });
    return Response.json({ data: { username: 'DifferentAccount' } });
  }), /X_ACCOUNT_MISMATCH/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.x.com/2/users/me');
  assert.equal(requests[0].options.method, 'GET');
});

test('X publisher uses official create-post endpoint after approval', async () => {
  const requests = [];
  const id = await publishSocialPost({
    platform: 'X',
    caption: '曖昧な欲しいを検索語に変える。',
    link: 'https://hoshilu.app/?utm_source=x',
    status: 'APPROVED'
  }, xBearerEnv(), async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/2/users/me')) {
      return Response.json({ data: { username: X_EXPECTED_USERNAME } });
    }
    return Response.json({ data: { id: 'post-1' } }, { status: 201 });
  });
  assert.equal(id, 'post-1');
  assert.deepEqual(requests.map(request => request.url), [
    'https://api.x.com/2/users/me',
    'https://api.x.com/2/tweets'
  ]);
  assert.match(requests[0].options.headers.authorization, /^Bearer /);
  assert.match(requests[1].options.headers.authorization, /^Bearer /);
});

test('social links percent-encode the complete Japanese search query', async () => {
  let postedText = '';
  await publishSocialPost({
    platform: 'X',
    caption: 'HOSHILU search example',
    link: 'https://hoshilu.app/?q=TikTokで見た光るスマホケース&utm_source=x',
    status: 'APPROVED'
  }, xBearerEnv(), async (url, options) => {
    if (url.endsWith('/2/users/me')) {
      return Response.json({ data: { username: X_EXPECTED_USERNAME } });
    }
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
    X_ACCESS_TOKEN_SECRET: 'access-secret',
    X_PUBLISHING_ENABLED: 'true',
    X_EXPECTED_USERNAME
  }, async (url, options) => {
    if (url.endsWith('/2/users/me')) {
      assert.match(options.headers.authorization, /^OAuth /);
      return Response.json({ data: { username: X_EXPECTED_USERNAME } });
    }
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
    X_ACCESS_TOKEN_SECRET: 'access-secret',
    X_PUBLISHING_ENABLED: 'true',
    X_EXPECTED_USERNAME
  }, async (url, options) => {
    if (url.endsWith('/2/users/me')) {
      assert.match(options.headers.authorization, /^OAuth /);
      return Response.json({ data: { username: X_EXPECTED_USERNAME } });
    }
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
  assert.equal('is_ai_generated' in createPayload, false);
  assert.equal(createPayload.share_to_feed, true);
  assert.equal(createPayload.hide_like_and_view_counts, true);
  assert.equal('image_url' in createPayload, false);
  assert.match(createPayload.caption, /#13モール横断/);
  assert.match(createPayload.caption, /@hoshilu\.app のプロフィールリンクから/);
  assert.doesNotMatch(createPayload.caption, /utm_source=/);
});

test('Runway Instagram Reels self-disclose AI generation through the platform label', async () => {
  let createPayload;
  await publishSocialPost({
    platform: 'INSTAGRAM',
    campaign_id: 'hoshilu-runway-video',
    caption: 'HOSHILU Runway reel',
    media_url: 'https://hoshilu.app/api/social/media/runway/runway-test.mp4',
    status: 'APPROVED'
  }, {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url, options = {}) => {
    if (url.endsWith('/123/media')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'runway-reel-container' });
    }
    if (url.includes('/runway-reel-container?fields=status_code')) {
      return Response.json({ status_code: 'FINISHED' });
    }
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'runway-reel' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(createPayload.media_type, 'REELS');
  assert.equal(createPayload.is_ai_generated, true);
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

const THREADS_ENV = {
  THREADS_ACCESS_TOKEN: 'token',
  THREADS_USER_ID: '123',
  THREADS_INITIAL_DELAY_MS: 0,
  THREADS_POLL_DELAY_MS: 0
};

test('Threads publisher creates a text-only container, waits for processing, then publishes with the UTM link in the body', async () => {
  const requests = [];
  let createPayload;
  const id = await publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU launch post',
    link: 'https://hoshilu.app/?utm_source=threads',
    status: 'APPROVED'
  }, THREADS_ENV, async (url, options = {}) => {
    requests.push(url);
    if (url.endsWith('/123/threads')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'threads-container-1' });
    }
    if (url.includes('/threads-container-1?fields=status')) {
      const checks = requests.filter(value => value.includes('/threads-container-1?fields=status')).length;
      return Response.json({ status: checks === 1 ? 'IN_PROGRESS' : 'FINISHED' });
    }
    if (url.endsWith('/123/threads_publish')) return Response.json({ id: 'threads-post-1' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'threads-post-1');
  assert.equal(createPayload.media_type, 'TEXT');
  assert.match(createPayload.text, /utm_source=threads/);
  assert.equal('image_url' in createPayload, false);
  assert.equal('video_url' in createPayload, false);
  assert.equal(requests.filter(value => value.includes('fields=status')).length, 2);
  assert.match(requests.at(-1), /threads_publish$/);
});

test('Threads publisher creates an IMAGE container for a non-video media URL', async () => {
  let createPayload;
  const id = await publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU image post',
    media_url: 'https://hoshilu.app/social/threads-launch.png',
    status: 'APPROVED'
  }, THREADS_ENV, async (url, options = {}) => {
    if (url.endsWith('/123/threads')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'threads-image-container' });
    }
    if (url.includes('/threads-image-container?fields=status')) return Response.json({ status: 'FINISHED' });
    if (url.endsWith('/123/threads_publish')) return Response.json({ id: 'threads-image-post' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'threads-image-post');
  assert.equal(createPayload.media_type, 'IMAGE');
  assert.equal(createPayload.image_url, 'https://hoshilu.app/social/threads-launch.png');
  assert.equal('video_url' in createPayload, false);
});

test('Threads publisher creates a VIDEO container for an MP4 media URL', async () => {
  let createPayload;
  const id = await publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU video post',
    media_url: 'https://hoshilu.app/social/threads-launch.mp4',
    status: 'APPROVED'
  }, THREADS_ENV, async (url, options = {}) => {
    if (url.endsWith('/123/threads')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'threads-video-container' });
    }
    if (url.includes('/threads-video-container?fields=status')) return Response.json({ status: 'FINISHED' });
    if (url.endsWith('/123/threads_publish')) return Response.json({ id: 'threads-video-post' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'threads-video-post');
  assert.equal(createPayload.media_type, 'VIDEO');
  assert.equal(createPayload.video_url, 'https://hoshilu.app/social/threads-launch.mp4');
  assert.equal('image_url' in createPayload, false);
});

test('Threads再試行は保存済みコンテナを再利用して重複作成しない', async () => {
  let creates = 0;
  const id = await publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads resume',
    platform_job_id: 'existing-threads-container',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) {
      creates += 1;
      return Response.json({ id: 'unexpected-container' });
    }
    if (url.includes('/existing-threads-container?fields=status')) return Response.json({ status: 'FINISHED' });
    if (url.endsWith('/123/threads_publish')) return Response.json({ id: 'resumed-threads-post' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'resumed-threads-post');
  assert.equal(creates, 0);
});

test('Threadsコンテナ作成時にonJobCreatedフックへcreation_idを渡す', async () => {
  const savedIds = [];
  await publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads hook test',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({ id: 'hook-container' });
    if (url.includes('/hook-container?fields=status')) return Response.json({ status: 'FINISHED' });
    if (url.endsWith('/123/threads_publish')) return Response.json({ id: 'hook-post' });
    return Response.json({}, { status: 404 });
  }, { onJobCreated: (id) => savedIds.push(id) });
  assert.deepEqual(savedIds, ['hook-container']);
});

test('Threadsコンテナ作成が失敗した場合はTHREADS_CREATE_エラーを投げる', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads create failure',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({ error: 'bad request' }, { status: 400 });
    return Response.json({}, { status: 404 });
  }), /THREADS_CREATE_400/);
});

test('Threadsコンテナがcreation_idを返さない場合はTHREADS_CREATION_ID_MISSINGを投げる', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads missing id',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({});
    return Response.json({}, { status: 404 });
  }), /THREADS_CREATION_ID_MISSING/);
});

test('Threadsコンテナ状態確認が失敗した場合はTHREADS_STATUS_エラーを投げる', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads status failure',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({ id: 'status-fail-container' });
    if (url.includes('/status-fail-container?fields=status')) return Response.json({ error: 'nope' }, { status: 500 });
    return Response.json({}, { status: 404 });
  }), /THREADS_STATUS_500/);
});

test('Threadsコンテナ処理がERRORED/EXPIREDになった場合はTHREADS_CONTAINER_エラーを投げる', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads errored container',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({ id: 'errored-container' });
    if (url.includes('/errored-container?fields=status')) return Response.json({ status: 'ERRORED' });
    return Response.json({}, { status: 404 });
  }), /THREADS_CONTAINER_ERRORED/);

  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads expired container',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({ id: 'expired-container' });
    if (url.includes('/expired-container?fields=status')) return Response.json({ status: 'EXPIRED' });
    return Response.json({}, { status: 404 });
  }), /THREADS_CONTAINER_EXPIRED/);
});

test('Threads公開APIが失敗した場合はTHREADS_PUBLISH_エラーを投げる', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads publish failure',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({ id: 'publish-fail-container' });
    if (url.includes('/publish-fail-container?fields=status')) return Response.json({ status: 'FINISHED' });
    if (url.endsWith('/123/threads_publish')) return Response.json({ error: 'server error' }, { status: 500 });
    return Response.json({}, { status: 404 });
  }), /THREADS_PUBLISH_500/);
});

test('Threads公開APIがidを返さない場合はTHREADS_PUBLISH_ID_MISSINGを投げる', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads publish missing id',
    status: 'APPROVED'
  }, THREADS_ENV, async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({ id: 'publish-missing-id-container' });
    if (url.includes('/publish-missing-id-container?fields=status')) return Response.json({ status: 'FINISHED' });
    if (url.endsWith('/123/threads_publish')) return Response.json({});
    return Response.json({}, { status: 404 });
  }), /THREADS_PUBLISH_ID_MISSING/);
});

test('不正なThreads media_urlはTHREADS_MEDIA_URL_INVALIDを投げる', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads invalid media url',
    media_url: 'not a url',
    status: 'APPROVED'
  }, THREADS_ENV, async () => Response.json({}, { status: 404 })), /THREADS_MEDIA_URL_INVALID/);
});

test('Threads認証情報が未設定の場合はSOCIAL_THREADS_NOT_CONFIGUREDを投げる', async () => {
  await assert.rejects(() => publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU threads not configured',
    status: 'APPROVED'
  }, {}, async () => Response.json({}, { status: 404 })), /SOCIAL_THREADS_NOT_CONFIGURED/);
});

test('公開済みInstagram投稿の正式URLとUTMを計測テーブルへ保存する', async () => {
  const writes = [];
  const env = {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('FROM social_post_queue q')) {
          return { bind: () => ({ all: async () => ({ results: [{
              post_id: 'approved-reel',
              campaign_id: 'hoshilu-runway-video',
              external_post_id: 'ig-media-1',
              published_at: '2026-08-12T14:45:15.000Z',
              link: 'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=model_reel&utm_content=approved_video'
            }] }) }) };
        }
        return {
          bind(...values) {
            return { run: async () => { writes.push({ sql, values }); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await syncInstagramPublishedPermalinks(env, new Date('2026-08-12T14:46:00.000Z'), async (url, options) => {
    assert.match(url, /ig-media-1\?fields=id,permalink,is_ai_generated$/);
    assert.equal(options.headers.authorization, 'Bearer token');
    return Response.json({ id: 'ig-media-1', permalink: 'https://www.instagram.com/reel/ExampleCode/', is_ai_generated: true });
  });
  assert.deepEqual(result, { checked: 1, saved: 1, failed: 0 });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].values, [
    'published:approved-reel', 'approved-reel',
    '2026-08-12T14:45:15.000Z', '2026-08-12T14:45:15.000Z',
    'https://www.instagram.com/reel/ExampleCode/',
    'instagram', 'organic_social', 'model_reel', 'approved_video',
    '2026-08-12T14:46:00.000Z'
  ]);
});

test('公開済み投稿APIはInstagram正式URLを即時保存して公開情報だけ返す', async () => {
  let storedUrl = '';
  const row = {
    post_id: 'approved-reel', platform: 'INSTAGRAM', status: 'PUBLISHED',
    external_post_id: 'ig-media-1', published_at: '2026-08-12T14:45:15.000Z'
  };
  const env = {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('SELECT q.post_id,q.platform,q.status')) {
          return { bind: () => ({ first: async () => ({ ...row, public_url: storedUrl }) }) };
        }
        if (sql.includes('SELECT q.post_id,q.campaign_id,q.external_post_id')) {
          return { bind: () => ({ all: async () => ({ results: [{
            ...row, campaign_id: 'model-reel', link: 'https://hoshilu.app/?utm_source=instagram'
          }] }) }) };
        }
        return {
          bind(...values) {
            return { run: async () => { storedUrl = values[4]; return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ permalink: 'https://www.instagram.com/reel/ExampleCode/', is_ai_generated: false });
  try {
    const response = await handleSocialAdminRoutes(new Request('https://hoshilu.app/api/social/posts/approved-reel'), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      post_id: 'approved-reel',
      platform: 'INSTAGRAM',
      status: 'PUBLISHED',
      external_post_id: 'ig-media-1',
      published_at: '2026-08-12T14:45:15.000Z',
      public_url: 'https://www.instagram.com/reel/ExampleCode/'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
