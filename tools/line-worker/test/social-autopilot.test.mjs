import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSocialAutopilotPosts,
  seedSocialAutopilotQueue
} from '../src/social-autopilot.mjs';

test('販促自動運用は14日先までX週4回・Instagram週2回だけを計画する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(posts.length, 12);
  assert.equal(posts.filter(post => post.platform === 'X').length, 8);
  assert.equal(posts.filter(post => post.platform === 'INSTAGRAM').length, 4);
  assert.equal(posts.some(post => post.platform === 'TIKTOK'), false);
  assert.equal(new Set(posts.map(post => post.post_id)).size, posts.length);
  assert.equal(new Set(posts.filter(post => post.platform === 'INSTAGRAM')
    .map(post => post.media_url)).size, 2);
  for (const post of posts) {
    assert.match(post.caption, /13モール|検索語|商品|条件/);
    assert.doesNotMatch(post.caption, /(?:9|10)モール/);
    assert.equal(new URL(post.link).hostname, 'hoshilu.app');
    assert.match(new URL(post.link).searchParams.get('utm_campaign'), /13mall/);
  }
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
    X_USER_ACCESS_TOKEN: 'x-token',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    PRODUCT_DB: {
      prepare(sql) {
        assert.match(sql, /INSERT OR IGNORE INTO social_post_queue/);
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
  assert.deepEqual(result, { enabled: true, planned: 12, inserted: 12 });
  assert.equal(rows.some(row => row[1] === 'TIKTOK'), false);
  assert.equal(rows.every(row => row[2] === 'hoshilu-evergreen-13mall-v1'), true);
});

test('販促自動運用は認証未設定の媒体をキューへ入れない', async () => {
  const platforms = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
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
  assert.equal(result.planned, 8);
  assert.deepEqual(new Set(platforms), new Set(['X']));
});
