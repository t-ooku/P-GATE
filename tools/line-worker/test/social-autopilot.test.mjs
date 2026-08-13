import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSocialAutopilotPosts,
  seedSocialAutopilotQueue
} from '../src/social-autopilot.mjs';

test('販促自動運用は今日の機能リールと14日先までの定期投稿を計画する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(posts.length, 13);
  assert.equal(posts.filter(post => post.platform === 'X').length, 6);
  assert.equal(posts.filter(post => post.platform === 'INSTAGRAM').length, 7);
  assert.equal(posts.some(post => post.platform === 'TIKTOK'), false);
  assert.equal(new Set(posts.map(post => post.post_id)).size, posts.length);
  assert.equal(new Set(posts.filter(post => post.platform === 'INSTAGRAM')
    .map(post => post.media_url)).size, 2);
  assert.equal(posts.filter(post => post.platform === 'INSTAGRAM')
    .every(post => post.media_url.endsWith('.mp4')), true);
  assert.equal(posts.filter(post => post.platform === 'X')
    .every(post => post.media_url.endsWith('.mp4')), true);
  const launchReel = posts.find(post => post.content_id === 'feature-launch-reel-20260809');
  assert.equal(launchReel.scheduled_at, '2026-08-09T11:15:00.000Z');
  assert.match(launchReel.caption, /ランキングとAI最安比較/);
  assert.match(launchReel.caption, /値下がり通知/);
  for (const post of posts) {
    assert.match(post.caption, /13モール|検索語|商品|条件/);
    assert.doesNotMatch(post.caption, /(?:9|10)モール/);
    assert.equal(new URL(post.link).hostname, 'hoshilu.app');
    assert.match(new URL(post.link).searchParams.get('utm_campaign'), /13mall/);
  }
});

test('Instagramは毎週月・水・金の20時15分にリールを計画する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-10T00:00:00.000Z'), 7)
    .filter(post => post.platform === 'INSTAGRAM');
  assert.deepEqual(posts.map(post => post.scheduled_at), [
    '2026-08-10T11:15:00.000Z',
    '2026-08-12T11:15:00.000Z',
    '2026-08-14T11:15:00.000Z'
  ]);
  assert.equal(posts.every(post => post.media_url.endsWith('.mp4')), true);
});

test('販促自動運用は無効時にキューを書き換えない', async () => {
  let prepared = 0;
  const result = await seedSocialAutopilotQueue({
    PRODUCT_DB: { prepare() { prepared += 1; } }
  }, new Date('2026-08-09T03:00:00.000Z'));
  assert.deepEqual(result, { enabled: false, planned: 0, inserted: 0 });
  assert.equal(prepared, 0);
});

test('販促自動運用は設定済み媒体だけをAPPROVEDで冪等登録する', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'HOSHILUOfficial',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: {
      prepare(sql) {
        assert.match(sql, /ON CONFLICT\(post_id\) DO UPDATE/);
        return {
          bind(...values) {
            return {
              async run() {
                rows.push(values);
                return { meta: { changes: 1 } };
              }
            };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.deepEqual(result, { enabled: true, planned: 13, inserted: 13 });
  assert.equal(rows.some(row => row[1] === 'TIKTOK'), false);
  assert.equal(rows.every(row => row[2] === 'hoshilu-official-13mall-v2'), true);
});

test('販促自動運用は認証未設定の媒体をキューへ入れない', async () => {
  const platforms = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'HOSHILUOfficial',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { platforms.push(values[1]); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 6);
  assert.deepEqual(new Set(platforms), new Set(['X']));
});

test('SOCIAL_AUTOPILOT_ENABLEDだけではXのAPPROVED投稿を自動投入しない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.deepEqual(result, { enabled: true, planned: 0, inserted: 0 });
  assert.equal(rows.length, 0);
});

test('X投稿接続を有効にしても定期シリーズを別承認しなければ自動投入しない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_PUBLISHING_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'iCHMR81Lv4VYJYG',
    X_USER_ACCESS_TOKEN: 'x-token',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.deepEqual(result, { enabled: true, planned: 0, inserted: 0 });
  assert.equal(rows.length, 0);
});

test('D1に保存したInstagram OAuth接続も自動投稿の接続済み媒体として扱う', async () => {
  const platforms = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_APP_ID: 'app-id',
    INSTAGRAM_APP_SECRET: 'a'.repeat(32),
    SOCIAL_OAUTH_ENCRYPTION_KEY: 'b'.repeat(32),
    INSTAGRAM_OAUTH_REDIRECT_URI: 'https://hoshilu.app/api/oauth/instagram/callback',
    INSTAGRAM_EXPECTED_USERNAME: 'hoshilu.app',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('FROM instagram_oauth_credentials')) {
          return {
            first: async () => ({
              status: 'ACTIVE',
              expires_at: '2099-01-01T00:00:00.000Z'
            })
          };
        }
        return {
          bind(...values) {
            return { async run() { platforms.push(values[1]); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 7);
  assert.deepEqual(new Set(platforms), new Set(['INSTAGRAM']));
});

test('Instagram OAuth接続だけでは未承認の定期リールを自動投入しない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: {
      prepare() {
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 0);
  assert.equal(rows.length, 0);
});

test('承認済み20260812動画はAI生成表示とUTM付きで一度だけキュー登録できる', async () => {
  const rows = [];
  const statements = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    APPROVED_MODEL_REEL_REPLAY_ENABLED: 'true',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  await seedSocialAutopilotQueue(env, new Date('2026-08-12T14:01:00.000Z'));
  const approved = rows.find(row => row[0] === 'hoshilu-approved-model-reel-20260812');
  assert.ok(approved);
  assert.equal(approved[2], 'hoshilu-ai-model-reel-20260812');
  assert.match(approved[4], /AI生成映像/);
  assert.match(approved[5], /utm_source=instagram/);
  assert.match(approved[6], /hoshilu-approved-model-reel-20260812\.mp4$/);
  assert.equal(approved[7], '2026-08-12T14:00:00.000Z');
  assert.equal(statements.some(sql => /INSTAGRAM_CONTAINER_IN_PROGRESS/.test(sql)), true);
  assert.equal(statements.some(sql => /SET status='APPROVED',last_error=''/.test(sql)), true);
});
