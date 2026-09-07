import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSocialPost, xWeightedLength,
  publishSocialPost,
  runDueSocialPosts,
  socialPublisherReadiness,
  xPublishingSafetyReadiness,
  syncInstagramPublishedPermalinks,
  syncThreadsInsights,
  handleSocialAdminRoutes,
  socialPublisherTest
} from '../src/social-publisher.mjs';

const X_EXPECTED_USERNAME = 'hoshilu_app';
const DAILY_AI_ACTRESS_CAPTION =
  '今日のバズを見てみよう。※この動画はAI生成・AI加工映像です。 #AI生成';

function dailyAiActressPost(overrides = {}) {
  return {
    post_id: 'hoshilu-ai-actress-daily-v1-instagram-2026-08-29',
    platform: 'INSTAGRAM',
    campaign_id: 'hoshilu-ai-actress-daily-v1',
    content_id: 'hoshilu-ai-actress-daily-2026-08-29',
    caption: DAILY_AI_ACTRESS_CAPTION,
    link: 'https://hoshilu.app/buzz?utm_source=instagram',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
    scheduled_at: '2026-08-29T11:15:00.000Z',
    status: 'APPROVED',
    creative_asset_id: 'hoshilu_ai_actress_daily_sat_v1',
    content_format: 'REEL',
    creative_policy: 'DAILY_AI_ACTRESS_22',
    jst_publish_date: '2026-08-29',
    ai_generated: 1,
    crosspost_group_id: 'hoshilu-ai-actress-daily-2026-08-29',
    ...overrides
  };
}

function dailyAiActressEvidence(overrides = {}) {
  return {
    asset_id: 'hoshilu_ai_actress_daily_sat_v1',
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
    media_sha256: '04dc93f703b34c35cefaa14a9cf9c7e9c5d5d5b2080c93793e1ec9cb2bcf8641',
    content_format: 'REEL',
    creative_policy: 'DAILY_AI_ACTRESS_22',
    persona_id: 'hoshilu-approved-model-reference-v2',
    persona_age: 22,
    ai_actress_present: 1,
    audio_confirmed: 1,
    rights_confirmed: 1,
    rights_ledger_id: 'hoshilu_ai_actress_daily_sat_v1',
    qa_status: 'PASSED',
    ai_generated: 1,
    ai_disclosure_confirmed: 1,
    approved_at: '2026-08-29T00:00:00.000Z',
    x_crosspost_count: 1,
    instagram_crosspost_count: 1,
    ...overrides
  };
}

function dailyAiActressDb(evidence = dailyAiActressEvidence()) {
  return {
    prepare(sql) {
      assert.match(sql, /FROM social_creative_assets/u);
      return {
        bind(...values) {
          assert.deepEqual(values, [
            'hoshilu_ai_actress_daily_sat_v1',
            'hoshilu-ai-actress-daily-2026-08-29',
            '2026-08-29',
            'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4'
          ]);
          return { first: async () => evidence };
        }
      };
    }
  };
}

function xBearerEnv(overrides = {}) {
  return {
    X_USER_ACCESS_TOKEN: 'token',
    X_PUBLISHING_ENABLED: 'true',
    X_EXPECTED_USERNAME,
    ...overrides
  };
}

test('Instagram投稿はコメント誘導とQoo10・SHEIN検索タグを公開前に補完する', () => {
  const post = normalizeSocialPost({ platform: 'INSTAGRAM', caption: '名前が分からなくても探せる', media_url: 'https://hoshilu.app/social/post.png', status: 'APPROVED' });
  assert.match(post.caption, /コメントで教えて/);
  for (const tag of ['#HOSHILU', '#Qoo10', '#SHEIN', '#購入品紹介']) assert.match(post.caption, new RegExp(tag));
  assert.doesNotMatch(post.caption, /#ホシル|#あいまい検索|#13モール横断|#ほしっとく/u);
});

test('Instagram投稿は内容に合わせてQoo10・SHEINの検索タグを選ぶ', () => {
  const qoo10 = normalizeSocialPost({
    platform: 'INSTAGRAM',
    caption: 'Qoo10で見た韓国コスメのリップを探したい。 #ホシル',
    status: 'APPROVED'
  });
  for (const tag of ['#HOSHILU', '#Qoo10', '#Qoo10購入品', '#韓国コスメ']) {
    assert.match(qoo10.caption, new RegExp(tag));
  }

  const shein = normalizeSocialPost({
    platform: 'INSTAGRAM',
    caption: 'SHEINで見たバッグの韓国コーデを探したい。 #あいまい検索',
    status: 'APPROVED'
  });
  for (const tag of ['#HOSHILU', '#SHEIN', '#SHEIN購入品', '#韓国ファッション']) {
    assert.match(shein.caption, new RegExp(tag));
  }
});

test('新検索ローンチ投稿は機能専用タグを使い、無関係なモール購入タグを付けない', () => {
  const visual = normalizeSocialPost({
    platform: 'INSTAGRAM', content_id: 'guide-search-screen',
    caption: '写真・スクショ・公開投稿URL・一言から商品を探せます。 @hoshilu.app',
    media_url: 'https://hoshilu.app/social/hoshilu-visual-search-launch-v1.png', status: 'APPROVED'
  });
  for (const tag of ['#HOSHILU', '#画像検索', '#商品検索']) assert.match(visual.caption, new RegExp(tag, 'u'));
  assert.doesNotMatch(visual.caption, /#Qoo10|#SHEIN|#購入品紹介/u);

  const continuous = normalizeSocialPost({
    platform: 'X', content_id: 'continuous-search',
    caption: '無料会員で有効にすると、HOSHILUが条件を定期的に探します。',
    link: 'https://hoshilu.app/?utm_source=x', status: 'APPROVED'
  });
  for (const tag of ['#HOSHILU', '#商品検索', '#見つかるまで探す']) assert.match(continuous.caption, new RegExp(tag, 'u'));
  assert.doesNotMatch(continuous.caption, /#Qoo10|#SHEIN|#購入品紹介/u);
});

test('X投稿はInstagram用の誤メンションを消して本文リンクへ案内する', () => {
  const post = normalizeSocialPost({
    platform: 'X',
    caption: 'Qoo10やSHEINで見た商品を探せる。続きは @hoshilu.app のプロフィールから。 #ホシル #AI生成',
    link: 'https://hoshilu.app/?utm_source=x',
    status: 'APPROVED'
  });
  assert.doesNotMatch(post.caption, /@hoshilu(?:\.app)?/iu);
  assert.match(post.caption, /詳しくは投稿内のリンクから。/u);
  assert.match(post.caption, /#Qoo10 #SHEIN/u);
  assert.match(post.caption, /#AI生成/u);
  assert.doesNotMatch(post.caption, /#ホシル/u);
});

test('Instagramから複製したX投稿の計測リンクはutm_source=xへ補正する', () => {
  const post = normalizeSocialPost({
    platform: 'X',
    caption: '海外で見た商品をHOSHILUで探せる。',
    link: 'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=runway',
    status: 'APPROVED'
  });
  assert.equal(new URL(post.link).searchParams.get('utm_source'), 'x');
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

test('22歳v2 AI女優ポリシーは公開直前に人物・音源・権利・QA・AI開示と両媒体割当を全件検証する', async () => {
  const invalidEvidence = [
    { persona_id: 'abstract-video' },
    { persona_age: 21 },
    { ai_actress_present: 0 },
    { audio_confirmed: 0 },
    { rights_confirmed: 0 },
    { rights_ledger_id: '' },
    { qa_status: 'PENDING' },
    { ai_generated: 0 },
    { ai_disclosure_confirmed: 0 },
    { media_sha256: 'not-a-sha256' },
    { x_crosspost_count: 0 },
    { instagram_crosspost_count: 0 }
  ];
  let externalRequests = 0;
  for (const invalid of invalidEvidence) {
    await assert.rejects(() => publishSocialPost(
      dailyAiActressPost(),
      {
        PRODUCT_DB: dailyAiActressDb(dailyAiActressEvidence(invalid)),
        INSTAGRAM_ACCESS_TOKEN: 'token',
        INSTAGRAM_ACCOUNT_ID: '123'
      },
      async () => {
        externalRequests += 1;
        return Response.json({ id: 'must-not-publish' });
      }
    ), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);
  }
  assert.equal(externalRequests, 0);

  await assert.rejects(() => publishSocialPost(
    dailyAiActressPost({ caption: 'AI女優の動画です。 #AI生成' }),
    { PRODUCT_DB: dailyAiActressDb(), INSTAGRAM_ACCESS_TOKEN: 'token', INSTAGRAM_ACCOUNT_ID: '123' },
    async () => {
      externalRequests += 1;
      return Response.json({ id: 'must-not-publish' });
    }
  ), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);
  assert.equal(externalRequests, 0);

  await assert.rejects(() => publishSocialPost(
    dailyAiActressPost({ creative_policy: '' }),
    { PRODUCT_DB: dailyAiActressDb(), INSTAGRAM_ACCESS_TOKEN: 'token', INSTAGRAM_ACCOUNT_ID: '123' },
    async () => {
      externalRequests += 1;
      return Response.json({ id: 'must-not-publish' });
    }
  ), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);
  assert.equal(externalRequests, 0);
});

test('適格な毎日AI女優Reelはqueue metadataからInstagram AI生成ラベルを設定する', async () => {
  let createPayload;
  const id = await publishSocialPost(dailyAiActressPost(), {
    PRODUCT_DB: dailyAiActressDb(),
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url, options = {}) => {
    if (url.endsWith('/123/media')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'daily-ai-actress-container' });
    }
    if (url.includes('/daily-ai-actress-container?fields=status_code')) {
      return Response.json({ status_code: 'FINISHED' });
    }
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'daily-ai-actress-reel' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'daily-ai-actress-reel');
  assert.equal(createPayload.media_type, 'REELS');
  assert.equal(createPayload.is_ai_generated, true);
  assert.match(createPayload.caption, /※この動画はAI生成・AI加工映像です。/u);
  assert.match(createPayload.caption, /#AI生成/u);
});

test('毎日AI女優ゲート不合格はFAILED放置せずREVIEW_REQUIREDへ戻し外部投稿しない', async () => {
  const row = dailyAiActressPost({
    post_id: 'daily-ai-actress-invalid',
    qa_status: 'PENDING'
  });
  const updates = [];
  const env = {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('SELECT * FROM social_post_queue')) {
          return { bind: () => ({ all: async () => ({ results: [row] }) }) };
        }
        if (sql.includes('FROM social_creative_assets')) {
          return { bind: () => ({ first: async () => dailyAiActressEvidence({ qa_status: 'PENDING' }) }) };
        }
        return {
          bind(...values) {
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
  let externalRequests = 0;
  const result = await runDueSocialPosts(env, new Date('2026-08-29T11:15:00.000Z'), async () => {
    externalRequests += 1;
    return Response.json({ id: 'must-not-publish' });
  });
  assert.deepEqual(result, { checked: 1, published: 0 });
  assert.equal(externalRequests, 0);
  const review = updates.find(item => item.sql.includes("status='REVIEW_REQUIRED'"));
  assert.ok(review);
  assert.deepEqual(review.values, [
    'daily-ai-actress-invalid', 'SOCIAL_AI_ACTRESS_POLICY_REQUIRED',
    '2026-08-29T11:15:00.000Z'
  ]);
  assert.equal(updates.some(item => item.sql.includes("status='FAILED'")
    && item.values[0] === row.post_id), false);
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

test('停止したMetaコンテナは次回cronで同じjob IDを使う再開対象へ戻す', async () => {
  const statements = [];
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            if (sql.includes('SELECT * FROM social_post_queue')) {
              return { all: async () => ({ results: [] }) };
            }
            return {
              run: async () => {
                statements.push({ sql, values });
                return { meta: { changes: 0 } };
              }
            };
          }
        };
      }
    }
  };

  const result = await runDueSocialPosts(env, new Date('2026-08-29T12:00:00.000Z'));
  assert.deepEqual(result, { checked: 0, published: 0 });
  const recoveryIndex = statements.findIndex(item => item.sql.includes("last_error='STALE_PUBLISHING_RESUME'"));
  const isolationIndex = statements.findIndex(item => item.sql.includes("SET status='FAILED'")
    && item.sql.includes("last_error='STALE_PUBLISHING_RECOVERED'"));
  assert.equal(recoveryIndex, 0);
  assert.ok(isolationIndex > recoveryIndex);
  const recovery = statements[recoveryIndex];
  assert.match(recovery.sql, /status='FAILED' AND last_error='STALE_PUBLISHING_RECOVERED'/u);
  assert.match(recovery.sql, /platform IN \('INSTAGRAM','THREADS'\) AND platform_job_id<>''/u);
  assert.match(recovery.sql, /external_post_id='' AND published_at=''/u);
  assert.deepEqual(recovery.values, [
    '2026-08-29T12:00:00.000Z',
    '2026-08-28T12:00:00.000Z'
  ]);
  const setClause = recovery.sql.slice(0, recovery.sql.indexOf('WHERE'));
  assert.doesNotMatch(setClause, /platform_job_id/u);
});

test('一時的な公開障害はFAILEDで止めず5分後のAPPROVED再試行へ戻す', async () => {
  const row = {
    post_id: 'transient-instagram-post', platform: 'INSTAGRAM', caption: 'retry approved Reel',
    media_url: 'https://hoshilu.app/social/retry-reel.mp4', platform_job_id: 'saved-container',
    status: 'APPROVED', scheduled_at: '2026-08-29T03:00:00.000Z'
  };
  const updates = [];
  const env = {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0,
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            if (sql.includes('SELECT * FROM social_post_queue')) {
              assert.match(sql, /LIMIT 1/);
              return { all: async () => ({ results: [row] }) };
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
  let checks = 0;
  const result = await runDueSocialPosts(env, new Date('2026-08-29T03:00:00.000Z'), async (url) => {
    if (url.includes('/saved-container?fields=status_code')) {
      checks += 1;
      return Response.json({ status_code: 'IN_PROGRESS' });
    }
    return Response.json({}, { status: 404 });
  });
  assert.deepEqual(result, { checked: 1, published: 0 });
  assert.equal(checks, 12);
  const retry = updates.find(item => item.sql.includes("SET status='APPROVED'")
    && item.values[0] === row.post_id);
  assert.ok(retry);
  assert.equal(retry.values[0], row.post_id);
  assert.equal(retry.values[1], 'INSTAGRAM_CONTAINER_IN_PROGRESS');
  assert.equal(retry.values[2], '2026-08-29T03:05:00.000Z');
  assert.equal(retry.values[4], 0);
  assert.equal(updates.some(item => item.sql.includes("SET status='FAILED'")
    && item.values[0] === row.post_id), false);
});

test('Instagramコンテナが次のcronでも処理中なら未公開job IDを破棄する', async () => {
  const row = {
    post_id: 'stalled-instagram-post', platform: 'INSTAGRAM', caption: 'approved image',
    media_url: 'https://hoshilu.app/social/guide.png', platform_job_id: 'stalled-container',
    last_error: 'INSTAGRAM_CONTAINER_IN_PROGRESS', status: 'APPROVED',
    scheduled_at: '2026-08-29T03:05:00.000Z'
  };
  const updates = [];
  const env = {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0,
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            if (sql.includes('SELECT * FROM social_post_queue')) {
              return { all: async () => ({ results: [row] }) };
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

  const result = await runDueSocialPosts(env, new Date('2026-08-29T03:05:00.000Z'), async (url) => {
    if (url.includes('/stalled-container?fields=status_code')) {
      return Response.json({ status_code: 'IN_PROGRESS' });
    }
    return Response.json({}, { status: 404 });
  });
  assert.deepEqual(result, { checked: 1, published: 0 });
  const retry = updates.find(item => item.sql.includes("SET status='APPROVED'")
    && item.values[0] === row.post_id);
  assert.ok(retry);
  assert.equal(retry.values[1], 'SOCIAL_RETRY_2:INSTAGRAM_CONTAINER_IN_PROGRESS');
  assert.equal(retry.values[4], 1);
  assert.match(retry.sql, /platform_job_id=CASE WHEN \?5=1 THEN ''/u);
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
  assert.ok(requests.every(({ options }) => options.redirect === 'manual'));
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

test('Instagram publisher waits for media processing and rejects authenticated redirects', async () => {
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
  }, async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/123/media')) return Response.json({ id: 'container-1' });
    if (url.includes('/container-1?fields=status_code')) {
      const checks = requests.filter(request => request.url.includes('/container-1?fields=status_code')).length;
      return Response.json({ status_code: checks === 1 ? 'IN_PROGRESS' : 'FINISHED' });
    }
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'ig-post-1' });
    return Response.json({}, { status: 404 });
  });
  assert.equal(id, 'ig-post-1');
  assert.equal(requests.filter(request => request.url.includes('status_code')).length, 2);
  assert.match(requests.at(-1).url, /media_publish$/);
  assert.ok(requests.every(({ options }) => options.redirect === 'manual'));
});

test('TikTok publisher rejects redirects on authenticated creator and publish requests', async () => {
  const requests = [];
  const id = await publishSocialPost({
    platform: 'TIKTOK',
    caption: 'HOSHILU TikTok post',
    media_url: 'https://hoshilu.app/social/tiktok-post.png',
    status: 'APPROVED'
  }, {
    TIKTOK_ACCESS_TOKEN: 'token',
    TIKTOK_APP_AUDITED: 'true'
  }, async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes('/creator_info/query/')) {
      return Response.json({ data: { privacy_level_options: ['PUBLIC_TO_EVERYONE'] } });
    }
    return Response.json({ data: { publish_id: 'tiktok-post-1' }, error: { code: 'ok' } });
  });
  assert.equal(id, 'tiktok-post-1');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ options }) => options.redirect === 'manual'));
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

test('Instagramの長時間処理は12回で中断し保存済みコンテナの再試行へ渡す', async () => {
  let checks = 0;
  const created = [];
  await assert.rejects(() => publishSocialPost({
    platform: 'INSTAGRAM',
    caption: 'HOSHILU slow reel',
    media_url: 'https://hoshilu.app/social/slow-reel.mp4',
    status: 'APPROVED'
  }, {
    INSTAGRAM_ACCESS_TOKEN: 'token',
    INSTAGRAM_ACCOUNT_ID: '123',
    INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url) => {
    if (url.endsWith('/123/media')) return Response.json({ id: 'slow-container' });
    if (url.includes('/slow-container?fields=status_code')) {
      checks += 1;
      return Response.json({ status_code: 'IN_PROGRESS' });
    }
    return Response.json({}, { status: 404 });
  }, { onJobCreated: id => created.push(id) }), /INSTAGRAM_CONTAINER_IN_PROGRESS/);
  assert.equal(checks, 12);
  assert.deepEqual(created, ['slow-container']);
});

test('XはHOSHILU静的Reelを公開Worker経由で自己取得せずASSETSから読む', async () => {
  const assetRequests = [];
  const apiRequests = [];
  const mediaId = await socialPublisherTest.uploadXVideo(
    'https://hoshilu.app/social/hoshilu-feature-reel-13mall-v1.mp4',
    'x-access-token',
    {
      ASSETS: {
        async fetch(request) {
          assetRequests.push(request);
          return new Response(new Uint8Array([0, 1, 2, 3]), {
            headers: { 'content-type': 'video/mp4' }
          });
        }
      }
    },
    async (url) => {
      assert.doesNotMatch(String(url), /^https:\/\/hoshilu\.app\/social\//);
      apiRequests.push(String(url));
      if (String(url).endsWith('/initialize')) return Response.json({ data: { id: 'media-1' } });
      if (String(url).endsWith('/append')) return new Response(null, { status: 204 });
      if (String(url).endsWith('/finalize')) return Response.json({ data: {} });
      return Response.json({}, { status: 404 });
    }
  );
  assert.equal(mediaId, 'media-1');
  assert.equal(assetRequests.length, 1);
  assert.equal(new URL(assetRequests[0].url).pathname,
    '/social/hoshilu-feature-reel-13mall-v1.mp4');
  assert.deepEqual(apiRequests.map(url => new URL(url).pathname), [
    '/2/media/upload/initialize',
    '/2/media/upload/media-1/append',
    '/2/media/upload/media-1/finalize'
  ]);
});

test('XはASSETS未設定や未対応の自サイト動画を公開Workerへフォールバックしない', async () => {
  let publicFetches = 0;
  const fetchImpl = async () => {
    publicFetches += 1;
    return Response.json({});
  };
  await assert.rejects(() => socialPublisherTest.uploadXVideo(
    'https://hoshilu.app/social/approved-reel.mp4', 'token', {}, fetchImpl
  ), /X_MEDIA_ASSETS_NOT_CONFIGURED/);
  await assert.rejects(() => socialPublisherTest.uploadXVideo(
    'https://hoshilu.app/api/other-video.mp4', 'token', {
      ASSETS: { fetch: async () => Response.json({}) }
    }, fetchImpl
  ), /X_MEDIA_SOURCE_UNSUPPORTED/);
  assert.equal(publicFetches, 0);
});

test('Xは上限超過がcontent-lengthで分かる動画をbufferへ読み込まない', async () => {
  let buffered = false;
  let xRequests = 0;
  await assert.rejects(() => socialPublisherTest.uploadXVideo(
    'https://hoshilu.app/social/oversized-reel.mp4', 'token', {
      X_MAX_VIDEO_BYTES: 10,
      ASSETS: {
        async fetch() {
          return {
            ok: true,
            headers: new Headers({
              'content-type': 'video/mp4',
              'content-length': '11'
            }),
            async arrayBuffer() {
              buffered = true;
              return new ArrayBuffer(11);
            }
          };
        }
      }
    },
    async () => {
      xRequests += 1;
      return Response.json({});
    }
  ), /X_MEDIA_SIZE_INVALID/);
  assert.equal(buffered, false);
  assert.equal(xRequests, 0);
});

test('投稿結果が曖昧な5xxは重複防止のため自動再投稿しない', () => {
  assert.equal(socialPublisherTest.isTransientSocialPublishError('X_MEDIA_FETCH_522'), true);
  assert.equal(socialPublisherTest.isTransientSocialPublishError('INSTAGRAM_CONTAINER_EXPIRED'), true);
  assert.equal(socialPublisherTest.isTransientSocialPublishError('X_PUBLISH_503'), false);
  assert.equal(socialPublisherTest.isTransientSocialPublishError('INSTAGRAM_PUBLISH_500'), false);
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
  assert.match(createPayload.caption, /#HOSHILU/);
  assert.match(createPayload.caption, /#Qoo10/);
  assert.match(createPayload.caption, /#SHEIN/);
  assert.match(createPayload.caption, /@hoshilu\.app のプロフィールリンクから/);
  assert.doesNotMatch(createPayload.caption, /utm_source=/);
});

test('Instagramはbare mentionだけではプロフィールリンクCTAを省略しない', async () => {
  let createPayload;
  await publishSocialPost({
    platform: 'INSTAGRAM', content_id: 'guide-search-screen',
    caption: '画像から探せます。 @hoshilu.app',
    media_url: 'https://hoshilu.app/social/hoshilu-visual-search-launch-v1.png',
    status: 'APPROVED'
  }, {
    INSTAGRAM_ACCESS_TOKEN: 'token', INSTAGRAM_ACCOUNT_ID: '123', INSTAGRAM_POLL_DELAY_MS: 0
  }, async (url, options = {}) => {
    if (url.endsWith('/123/media')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'launch-container' });
    }
    if (url.includes('/launch-container?fields=status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/123/media_publish')) return Response.json({ id: 'launch-post' });
    return Response.json({}, { status: 404 });
  });
  assert.match(createPayload.caption, /続きは @hoshilu\.app のプロフィールリンクから。/u);
  assert.doesNotMatch(createPayload.caption, /#Qoo10|#SHEIN|#購入品紹介/u);
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

test('Threads publisher creates a text-only container and rejects authenticated redirects', async () => {
  const requests = [];
  let createPayload;
  const id = await publishSocialPost({
    platform: 'THREADS',
    caption: 'HOSHILU launch post',
    link: 'https://hoshilu.app/?utm_source=threads',
    status: 'APPROVED'
  }, THREADS_ENV, async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/123/threads')) {
      createPayload = JSON.parse(options.body);
      return Response.json({ id: 'threads-container-1' });
    }
    if (url.includes('/threads-container-1?fields=status')) {
      const checks = requests.filter(request => request.url.includes('/threads-container-1?fields=status')).length;
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
  assert.equal(requests.filter(request => request.url.includes('fields=status')).length, 2);
  assert.match(requests.at(-1).url, /threads_publish$/);
  assert.ok(requests.every(({ options }) => options.redirect === 'manual'));
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
    assert.equal(options.redirect, 'manual');
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

test('公開済みX投稿APIは数値post IDから検証可能な公開URLを返す', async () => {
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        assert.match(sql, /SELECT q\.post_id,q\.platform,q\.status/u);
        return { bind: () => ({ first: async () => ({
          post_id: 'daily-x-20260822',
          platform: 'X',
          status: 'PUBLISHED',
          external_post_id: '2091118236762878262',
          published_at: '2026-08-22T11:00:01.000Z',
          public_url: null
        }) }) };
      }
    }
  };
  const response = await handleSocialAdminRoutes(
    new Request('https://hoshilu.app/api/social/posts/daily-x-20260822'), env
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    post_id: 'daily-x-20260822',
    platform: 'X',
    status: 'PUBLISHED',
    external_post_id: '2091118236762878262',
    published_at: '2026-08-22T11:00:01.000Z',
    public_url: 'https://x.com/i/web/status/2091118236762878262'
  });
});

test('公開投稿APIは本文を出さずREVIEW_REQUIREDと安全な再利用コードを返す', async () => {
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes("q.status='PUBLISHED'")) {
          return { bind: () => ({ first: async () => null }) };
        }
        assert.match(sql, /CASE WHEN last_error IN \('MEDIA_REUSE_REVIEW_REQUIRED'/u);
        return { bind: () => ({ first: async () => ({
          post_id: 'reel-x-20260826',
          platform: 'X',
          status: 'REVIEW_REQUIRED',
          safe_error_code: 'MEDIA_REUSE_REVIEW_REQUIRED'
        }) }) };
      }
    }
  };
  const response = await handleSocialAdminRoutes(
    new Request('https://hoshilu.app/api/social/posts/reel-x-20260826'), env
  );
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    ok: false,
    post_id: 'reel-x-20260826',
    platform: 'X',
    status: 'REVIEW_REQUIRED',
    error: 'SOCIAL_POST_REVIEW_REQUIRED',
    safe_error_code: 'MEDIA_REUSE_REVIEW_REQUIRED'
  });
});

test('公開投稿APIは過去の一時隔離理由を固定安全コードとして返す', async () => {
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes("q.status='PUBLISHED'")) {
          return { bind: () => ({ first: async () => null }) };
        }
        return { bind: () => ({ first: async () => ({
          post_id: 'daily-x-20260826',
          platform: 'X',
          status: 'CANCELLED',
          safe_error_code: 'SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813'
        }) }) };
      }
    }
  };
  const response = await handleSocialAdminRoutes(
    new Request('https://hoshilu.app/api/social/posts/daily-x-20260826'), env
  );
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    ok: false,
    post_id: 'daily-x-20260826',
    platform: 'X',
    status: 'CANCELLED',
    error: 'SOCIAL_POST_CANCELLED',
    safe_error_code: 'SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813'
  });
});

test('公開投稿APIは任意のpublisherエラー本文を公開せずFAILEDだけ返す', async () => {
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes("q.status='PUBLISHED'")) {
          return { bind: () => ({ first: async () => null }) };
        }
        return { bind: () => ({ first: async () => ({
          post_id: 'guide-instagram-20260826',
          platform: 'INSTAGRAM',
          status: 'FAILED',
          safe_error_code: ''
        }) }) };
      }
    }
  };
  const response = await handleSocialAdminRoutes(
    new Request('https://hoshilu.app/api/social/posts/guide-instagram-20260826'), env
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    ok: false,
    post_id: 'guide-instagram-20260826',
    platform: 'INSTAGRAM',
    status: 'FAILED',
    error: 'SOCIAL_POST_FAILED'
  });
});

test('Threadsインサイト取り込みはpermalinkと指標をJST日次スナップショットへ保存する', async () => {
  const writes = [];
  const env = {
    THREADS_ACCESS_TOKEN: 'token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('FROM social_post_queue')) {
          return { bind: () => ({ all: async () => ({ results: [{
              post_id: 'threads-post-1',
              campaign_id: 'hoshilu-threads-amazon-boost-v1',
              external_post_id: 'threads-media-1',
              published_at: '2026-08-17T03:00:00.000Z',
              link: 'https://hoshilu.app/?utm_source=threads&utm_medium=social&utm_campaign=hoshilu-threads-amazon-boost-v1&utm_content=amazon-boost-books'
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
  const requests = [];
  const result = await syncThreadsInsights(env, new Date('2026-08-17T12:00:00.000Z'), async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.authorization, 'Bearer token');
    assert.equal(options.redirect, 'manual');
    if (url.includes('fields=permalink')) {
      return Response.json({ permalink: 'https://www.threads.com/@hoshilu.app/post/ExampleCode' });
    }
    if (url.includes('/insights')) {
      return Response.json({ data: [
        { name: 'views', values: [{ value: 120 }] },
        { name: 'likes', values: [{ value: 8 }] },
        { name: 'replies', values: [{ value: 2 }] },
        { name: 'reposts', values: [{ value: 1 }] },
        { name: 'quotes', values: [{ value: 0 }] },
        { name: 'shares', values: [{ value: 3 }] }
      ] });
    }
    return Response.json({}, { status: 404 });
  });
  assert.deepEqual(result, { checked: 1, saved: 1, failed: 0 });
  assert.equal(requests.some(url => url.includes('threads-media-1?fields=permalink')), true);
  assert.equal(requests.some(url => url.includes('threads-media-1/insights?metric=views,likes,replies,reposts,quotes,shares')), true);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].values, [
    'threads:threads-post-1:2026-08-17', 'threads-post-1',
    '2026-08-17T12:00:00.000Z', '2026-08-17T03:00:00.000Z',
    'https://www.threads.com/@hoshilu.app/post/ExampleCode',
    'threads', 'social', 'hoshilu-threads-amazon-boost-v1', 'amazon-boost-books',
    120, 2, 4,
    '2026-08-17T12:00:00.000Z'
  ]);
});

test('Threadsインサイト取り込みは同じJST日内の再実行で同一スナップショットを更新する', async () => {
  const upserts = [];
  const env = {
    THREADS_ACCESS_TOKEN: 'token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('FROM social_post_queue')) {
          return { bind: () => ({ all: async () => ({ results: [{
              post_id: 'threads-post-1', campaign_id: 'c', external_post_id: 'threads-media-1',
              published_at: '2026-08-17T03:00:00.000Z', link: ''
            }] }) }) };
        }
        return {
          bind(...values) { return { run: async () => { upserts.push(values[0]); return { meta: { changes: 1 } }; } }; }
        };
      }
    }
  };
  const fetchImpl = async (url) => (url.includes('fields=permalink')
    ? Response.json({ permalink: 'https://www.threads.com/@hoshilu.app/post/ExampleCode' })
    : Response.json({ data: [{ name: 'views', values: [{ value: 10 }] }] }));
  await syncThreadsInsights(env, new Date('2026-08-17T09:00:00.000Z'), fetchImpl);
  await syncThreadsInsights(env, new Date('2026-08-17T13:00:00.000Z'), fetchImpl); // 同じJST日(18:00-22:00)の後刻
  assert.deepEqual(upserts, ['threads:threads-post-1:2026-08-17', 'threads:threads-post-1:2026-08-17']);
});

test('Threads未設定時はDBへ問い合わせずに0件を返す', async () => {
  let queried = false;
  const env = {
    PRODUCT_DB: { prepare() { queried = true; return { bind: () => ({ all: async () => ({ results: [] }) }) }; } }
  };
  const result = await syncThreadsInsights(env, new Date(), async () => Response.json({}));
  assert.deepEqual(result, { checked: 0, saved: 0, failed: 0 });
  assert.equal(queried, false);
});

test('Threadsインサイトのクエリ失敗はfailed:1を返しスローしない', async () => {
  const env = {
    THREADS_ACCESS_TOKEN: 'token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: { prepare() { return { bind: () => ({ all: async () => { throw new Error('D1_DOWN'); } }) }; } }
  };
  const result = await syncThreadsInsights(env, new Date(), async () => Response.json({}));
  assert.deepEqual(result, { checked: 0, saved: 0, failed: 1 });
});

test('Threadsインサイトの一部行が失敗しても残りの行は保存される', async () => {
  const writes = [];
  const env = {
    THREADS_ACCESS_TOKEN: 'token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('FROM social_post_queue')) {
          return { bind: () => ({ all: async () => ({ results: [
            { post_id: 'threads-fail', campaign_id: 'c', external_post_id: 'media-fail', published_at: '2026-08-17T03:00:00.000Z', link: '' },
            { post_id: 'threads-ok', campaign_id: 'c', external_post_id: 'media-ok', published_at: '2026-08-17T03:00:00.000Z', link: '' }
          ] }) }) };
        }
        return { bind(...values) { return { run: async () => { writes.push(values[0]); return { meta: { changes: 1 } }; } }; } };
      }
    }
  };
  const result = await syncThreadsInsights(env, new Date('2026-08-17T12:00:00.000Z'), async (url) => {
    if (url.includes('media-fail')) return Response.json({ error: 'nope' }, { status: 500 });
    if (url.includes('fields=permalink')) return Response.json({ permalink: 'https://www.threads.com/@hoshilu.app/post/Ok' });
    return Response.json({ data: [] });
  });
  assert.deepEqual(result, { checked: 2, saved: 1, failed: 1 });
  assert.deepEqual(writes, ['threads:threads-ok:2026-08-17']);
});

test('公開情報APIはThreadsのpublic_url未取得時にインサイト取り込みを試みる', async () => {
  let storedUrl = '';
  const row = {
    post_id: 'threads-post', platform: 'THREADS', status: 'PUBLISHED',
    external_post_id: 'threads-media-1', published_at: '2026-08-17T03:00:00.000Z'
  };
  const env = {
    THREADS_ACCESS_TOKEN: 'token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('SELECT q.post_id,q.platform,q.status')) {
          return { bind: () => ({ first: async () => ({ ...row, public_url: storedUrl }) }) };
        }
        if (sql.includes('FROM social_post_queue')) {
          return { bind: () => ({ all: async () => ({ results: [{ ...row, campaign_id: 'c', link: '' }] }) }) };
        }
        return { bind(...values) { return { run: async () => { storedUrl = values[4]; return { meta: { changes: 1 } }; } }; } };
      }
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (url.includes('fields=permalink')
    ? Response.json({ permalink: 'https://www.threads.com/@hoshilu.app/post/Example' })
    : Response.json({ data: [] }));
  try {
    const response = await handleSocialAdminRoutes(new Request('https://hoshilu.app/api/social/posts/threads-post'), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      post_id: 'threads-post',
      platform: 'THREADS',
      status: 'PUBLISHED',
      external_post_id: 'threads-media-1',
      published_at: '2026-08-17T03:00:00.000Z',
      public_url: 'https://www.threads.com/@hoshilu.app/post/Example'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('X投稿はPR表記とリンクを足してもXの重み付き280を超えない', () => {
  // Xの280は文字数ではなく重み付き文字数(日本語は1文字=2)で、URLは実長に
  // 関わらず常に23として数えられる。従来の「240文字で切る」だけでは
  // 日本語240文字=480相当となり上限の倍近くまで通ってしまっていた。
  const longJapanese = 'あ'.repeat(300);
  const post = normalizeSocialPost({
    post_id: 'x-long', platform: 'X', caption: longJapanese,
    link: 'https://hoshilu.app/?utm_source=x&utm_medium=social&utm_campaign=c&utm_content=d&q=' + encodeURIComponent('とても長い検索語'),
    affiliate: true, scheduled_at: '2026-08-18T03:30:00.000Z', status: 'APPROVED'
  });
  // publish時の本文は caption + '\n' + link (social-publisher の publishX と同じ組み立て)
  const weighted = xWeightedLength(post.caption) + 1 + 23;
  assert.ok(weighted <= 280, `重み付き${weighted}で280を超えている`);
  assert.match(post.caption, /アフィリエイト/, 'PR表記は落とさない');
  assert.match(post.caption, /#Qoo10 #SHEIN/u, '検索タグは途中で切らない');
  assert.doesNotMatch(post.caption, /#(?:Qoo1|SHEI)$/u, '不完全なタグを残さない');
});

test('X以外のプラットフォームはXの重み付き上限に巻き込まれない', () => {
  const caption = 'あ'.repeat(300);
  const threads = normalizeSocialPost({
    post_id: 't-long', platform: 'THREADS', caption,
    scheduled_at: '2026-08-18T03:30:00.000Z', status: 'APPROVED'
  });
  assert.equal(threads.caption.length, 300, 'THREADSは400文字までそのまま');
});
