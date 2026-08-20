import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSocialAutopilotPosts,
  buildThreadsAmazonBoostPosts,
  seedSocialAutopilotQueue,
  runSocialAutopilotCycle
} from '../src/social-autopilot.mjs';

test('販促自動運用は今日の機能リールと14日先までの定期投稿を計画する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(posts.length, 27);
  assert.equal(posts.filter(post => post.platform === 'X').length, 14);
  assert.equal(posts.filter(post => post.platform === 'INSTAGRAM').length, 13);
  assert.equal(posts.some(post => post.platform === 'TIKTOK'), false);
  assert.equal(new Set(posts.map(post => post.post_id)).size, posts.length);
  assert.equal(new Set(posts.filter(post => post.platform === 'INSTAGRAM')
    .map(post => post.media_url)).size, 6);
  assert.equal(posts.filter(post => post.platform === 'INSTAGRAM')
    .every(post => typeof post.media_url === 'string' && post.media_url.length > 0), true);
  assert.equal(posts.filter(post => post.platform === 'X')
    .filter(post => post.media_url).every(post => post.media_url.endsWith('.mp4')), true);
  assert.equal(posts.some(post => post.platform === 'X' && !post.media_url), true);
  assert.equal(posts.some(post => post.platform === 'INSTAGRAM'
    && /guide-/.test(post.post_id) && /\.(?:jpg|png)$/.test(post.media_url)), true);
  const launchReel = posts.find(post => post.content_id === 'feature-launch-reel-20260809');
  assert.equal(launchReel.scheduled_at, '2026-08-09T11:15:00.000Z');
  assert.match(launchReel.caption, /ランキングとAI最安比較/);
  assert.match(launchReel.caption, /値下がり通知/);
  for (const post of posts) {
    assert.match(post.caption, /13モール|検索|商品|条件|価格/);
    assert.doesNotMatch(post.caption, /(?:9|10)モール/);
    assert.equal(new URL(post.link).hostname, 'hoshilu.app');
    assert.match(new URL(post.link).searchParams.get('utm_campaign'), /13mall/);
  }
});

test('Instagramは月〜土20時15分、月・水・金をリールにする', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-10T00:00:00.000Z'), 7)
    .filter(post => post.platform === 'INSTAGRAM');
  assert.deepEqual(posts.map(post => post.scheduled_at), [
    '2026-08-10T11:15:00.000Z',
    '2026-08-11T11:15:00.000Z',
    '2026-08-12T11:15:00.000Z',
    '2026-08-13T11:15:00.000Z',
    '2026-08-14T11:15:00.000Z',
    '2026-08-15T11:15:00.000Z'
  ]);
  assert.equal(posts.filter(post => /evergreen-instagram/.test(post.content_id))
    .every(post => post.media_url.endsWith('.mp4')), true);
});

test('Instagram定常投稿はBUZZ専用ビジュアルと/buzz送客を含む', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-20T00:00:00.000Z'), 30)
    .filter(post => post.platform === 'INSTAGRAM' && /^buzz-/.test(post.content_id));
  assert.ok(posts.length >= 2);
  for (const post of posts) {
    assert.equal(new URL(post.link).pathname, '/buzz');
    assert.match(post.media_url, /hoshilu-buzz-ranking-v1\.jpg$/u);
    assert.match(post.caption, /1位|ランキング/u);
    assert.doesNotMatch(post.caption, /最安|No\.?1|Z世代/u);
  }
});

test('Amazon優先Threadsローテーションは1日2本、昼夜の枠で別内容を計画する', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'));
  // 14日 × 昼夜2枠。当日12:30 JST(03:00 UTC時点では未到来)も含む。
  assert.equal(posts.length, 28);
  assert.equal(posts.every(post => post.platform === 'THREADS'), true);
  assert.equal(new Set(posts.map(post => post.post_id)).size, posts.length);
  assert.equal(posts.every(post => post.campaign_id === 'hoshilu-threads-amazon-boost-v1'), true);
  assert.equal(posts.every(post => !/[¥$]\s?\d|\d+\s?円/.test(post.caption)), true, '本文に価格を直書きしない');

  // 昼枠のpost_idは接尾辞なし(1日1本だった頃のキュー行をそのまま更新できる)、
  // 夜枠は-pm。同じ日に2本重複して積まれないことを固定する。
  const noon = posts.filter(post => post.scheduled_at.endsWith('T03:30:00.000Z'));
  const night = posts.filter(post => post.scheduled_at.endsWith('T11:30:00.000Z'));
  assert.equal(noon.length, 14);
  assert.equal(night.length, 14);
  assert.equal(noon.every(post => !post.post_id.endsWith('-pm')), true);
  assert.equal(night.every(post => post.post_id.endsWith('-pm')), true);

  // 同じ日の昼と夜は別内容。翌日も次のローテーションへ進む。
  assert.notEqual(posts[0].content_id, posts[1].content_id);
  assert.notEqual(posts[0].content_id, posts[2].content_id);
});

test('Amazon優先Threadsローテーションはリンク付きのみをアフィリエイトとして扱う', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'));
  const affiliate = posts.filter(post => post.affiliate);
  const organic = posts.filter(post => !post.affiliate);

  // 運用設計書v1.0第2部: 宣伝botに見えないよう非アフィリエイト投稿を混ぜる。
  // 20本中5本(25%)がリンク無しなので、どの14日を切り出しても必ず両方入る。
  assert.ok(organic.length > 0, '非アフィリエイト投稿が1本も計画されていない');
  assert.ok(affiliate.length > organic.length, 'アフィリエイト投稿が主体であること');

  for (const post of affiliate) {
    const url = new URL(post.link);
    assert.equal(url.hostname, 'hoshilu.app');
    assert.equal(url.searchParams.get('utm_source'), 'threads');
    assert.equal(url.searchParams.get('utm_campaign'), 'hoshilu-threads-amazon-boost-v1');
    assert.ok(url.searchParams.get('q'), '検索語(q)が必ず含まれる');
    assert.match(post.caption, /アフィリエイト広告/, 'アフィリエイト投稿にはPR表記が要る');
  }
  for (const post of organic) {
    assert.equal(post.link, '', '非アフィリエイト投稿にリンクを付けない');
    // 広告ではないのにPR表記が付く、という逆向きの不正確さも防ぐ。
    assert.doesNotMatch(post.caption, /アフィリエイト/, '非アフィリエイト投稿にPR表記を付けない');
  }
});

test('Amazon優先Threadsローテーションの文面は20本あり、10日間は重複しない', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'), 10);
  // 1日2本 × 10日 = 20本ぶんで、ちょうど一巡する。
  assert.equal(posts.length, 20);
  assert.equal(new Set(posts.map(post => post.content_id)).size, 20, '10日以内に同じ文面が再投稿されている');
});

test('Amazon優先Threadsローテーションは同じ計画対象期間なら毎回同じ投稿を計画する(冪等)', () => {
  // どちらも当日12:30 JST(03:30 UTC)の投稿枠より前なので、計画対象の
  // post_id集合は完全に一致するはず(過去分は自動的に取り除かれる)。
  const first = buildThreadsAmazonBoostPosts(new Date('2026-08-17T02:00:00.000Z'));
  const second = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'));
  assert.deepEqual(first.map(post => post.post_id), second.map(post => post.post_id));
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
  assert.deepEqual(result, { enabled: true, planned: 27, inserted: 27 });
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
  assert.equal(result.planned, 14);
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
  assert.equal(result.planned, 13);
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

test('THREADS認証済みでもTHREADS_EVERGREEN_AUTOPILOT_ENABLEDが無ければAmazon優先投稿を入れない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: {
      prepare() {
        return { bind(...values) { return { async run() { rows.push(values); return { meta: { changes: 1 } }; } }; } };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 0);
  assert.equal(rows.some(row => row[1] === 'THREADS'), false);
});

test('THREADS_EVERGREEN_AUTOPILOT_ENABLEDが有効でもTHREADS未認証ならAmazon優先投稿を入れない', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    THREADS_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    PRODUCT_DB: {
      prepare() {
        return { bind(...values) { return { async run() { rows.push(values); return { meta: { changes: 1 } }; } }; } };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  assert.equal(result.planned, 0);
  assert.equal(rows.some(row => row[1] === 'THREADS'), false);
});

test('THREADS認証とTHREADS_EVERGREEN_AUTOPILOT_ENABLEDが揃うとAmazon優先投稿をAPPROVEDで冪等登録する', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    THREADS_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    PRODUCT_DB: {
      prepare(sql) {
        assert.match(sql, /ON CONFLICT\(post_id\) DO UPDATE/);
        return {
          bind(...values) {
            return { async run() { rows.push(values); return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-09T03:00:00.000Z'));
  const threadsRows = rows.filter(row => row[1] === 'THREADS');
  assert.equal(threadsRows.length, 28); // 14日 × 昼夜2枠
  assert.equal(result.planned, 28);
  assert.equal(result.inserted, 28);
  assert.equal(threadsRows.every(row => row[2] === 'hoshilu-threads-amazon-boost-v1'), true);
  // affiliateがDBへ0/1として正しく保存される。リンク付きは1、
  // 非アフィリエイト枠(リンク無し)は0で、両方が実際に計画されている。
  assert.equal(threadsRows.every(row => row[8] === 0 || row[8] === 1), true);
  const affiliateRows = threadsRows.filter(row => row[8] === 1);
  const organicRows = threadsRows.filter(row => row[8] === 0);
  assert.ok(affiliateRows.length > 0 && organicRows.length > 0);
  assert.equal(affiliateRows.every(row => row[5] !== ''), true, 'affiliate=1はリンクを持つ');
  assert.equal(organicRows.every(row => row[5] === ''), true, 'affiliate=0はリンクを持たない');
});

test('自動運用の1サイクルはThreadsインサイト取り込みも実行し結果を返す', async () => {
  let threadsInsightsQueried = false;
  const env = {
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    PRODUCT_DB: {
      prepare(sql) {
        if (sql.includes('social_post_queue') && sql.includes("platform='THREADS'")) threadsInsightsQueried = true;
        return { bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }) };
      }
    }
  };
  const result = await runSocialAutopilotCycle(env, new Date('2026-08-17T03:00:00.000Z'), async () => Response.json({}));
  assert.deepEqual(result.threadsInsights, { checked: 0, saved: 0, failed: 0 });
  assert.equal(threadsInsightsQueried, true);
});

// 2026-08-19 大隆さん指示: HOSHILU BUZZ(/buzz)をSNS定常投稿へ織り交ぜる。
test('X定常ローテーションはHOSHILU BUZZ紹介を含み、/buzzへUTM付きで送客する', () => {
  // 30日分でX非動画枠の全ローテーション(6本)が一巡することを確認する。
  const posts = buildSocialAutopilotPosts(new Date('2026-08-20T00:00:00.000Z'), 30)
    .filter(post => post.platform === 'X' && /-x-guide-/.test(post.post_id));
  const buzzPosts = posts.filter(post => /^buzz-/.test(post.content_id));
  assert.ok(buzzPosts.length >= 2, 'BUZZ posts must appear in the rotation');
  for (const post of buzzPosts) {
    const url = new URL(post.link);
    assert.equal(url.hostname, 'hoshilu.app');
    assert.equal(url.pathname, '/buzz');
    assert.equal(url.searchParams.get('q'), null, 'BUZZ posts must not carry a search query');
    assert.match(url.searchParams.get('utm_campaign'), /13mall/);
    assert.match(post.caption, /公式ランキング|価格を確認できた商品/u);
    assert.doesNotMatch(post.caption, /No\.?1|最安|バズって|Z世代/u);
  }
  // 既存の検索ガイド投稿は従来どおりホーム(/)へ。
  const guidePosts = posts.filter(post => !/^buzz-/.test(post.content_id));
  assert.ok(guidePosts.length > 0);
  for (const post of guidePosts) assert.equal(new URL(post.link).pathname, '/');
});
