import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
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
  assert.ok(new Set(posts.filter(post => post.platform === 'INSTAGRAM')
    .map(post => post.media_url)).size >= 5);
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
  assert.match(launchReel.caption, /購入希望価格ウォッチ/);
  for (const post of posts) {
    assert.match(post.caption, /13モール|検索|商品|条件|価格/);
    assert.doesNotMatch(post.caption, /(?:9|10)モール/);
    assert.equal(new URL(post.link).hostname, 'hoshilu.app');
    assert.match(new URL(post.link).searchParams.get('utm_campaign'), /13mall/);
  }
});

test('非BUZZ販促はスクショ・公開投稿URL・一言検索を過剰表現なしで訴求する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-24T00:00:00.000Z'), 28);
  for (const platform of ['X', 'INSTAGRAM']) {
    const campaign = posts.filter((post) => post.platform === platform && new URL(post.link).pathname === '/');
    assert.ok(campaign.some((post) => /スクショ/u.test(post.caption)), `${platform}: screenshot copy`);
    assert.ok(campaign.some((post) => /公開(?:SNS)?投稿.*URL|公開SNS投稿のURL/u.test(post.caption)), `${platform}: URL copy`);
    assert.ok(campaign.some((post) => /一言/u.test(post.caption)), `${platform}: remembered phrase copy`);
    assert.ok(campaign.every((post) => !/必ず(?:特定|見つかる)|全SNS対応/u.test(post.caption)));
  }
  const threads = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'), 10);
  assert.ok(threads.some((post) => /スクショ.*公開SNS投稿URL.*一言/u.test(post.caption)));
  const searchGuide = posts.find((post) => post.content_id === 'guide-search-screen');
  assert.ok(searchGuide, '3入力のInstagram操作案内が計画されていない');
  assert.doesNotMatch(searchGuide.media_url, /hoshilu-product-screen-v1\.jpg/u);
  assert.match(searchGuide.media_url, /instagram-ambiguous-four-market-v1\.png/u);
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

test('土曜の操作案内は承認済み質問カードと同じ検索説明をする', () => {
  const post = buildSocialAutopilotPosts(new Date('2026-08-22T10:59:00.000Z'), 1)
    .find(item => item.platform === 'INSTAGRAM');
  assert.ok(post);
  assert.equal(post.media_url, 'https://hoshilu.app/social/instagram-want-poll-v1.png');
  assert.match(post.caption, /商品名が分からなくても|見た場所・色・形・使い方/u);
  assert.doesNotMatch(post.caption, /値下がり通知|購入希望価格|買いたい価格/u);
});

test('価格通知の販促は希望価格閾値とAPI確認価格だけを説明する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-24T00:00:00.000Z'), 28);
  const targetPricePosts = posts.filter((post) => /購入希望価格/u.test(post.caption));
  assert.ok(targetPricePosts.length > 0);
  assert.ok(targetPricePosts.some((post) => /APIで確認できた価格.*(?:以下|条件)/u.test(post.caption)));
  assert.ok(posts.every((post) => !/値下がり通知|24時間監視|クーポン.*再入荷/u.test(post.caption)));
});

test('Instagram定常投稿はBUZZ専用ビジュアルと/buzz送客を含む', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-20T00:00:00.000Z'), 30)
    .filter(post => post.platform === 'INSTAGRAM' && /^buzz-image-/.test(post.content_id));
  assert.ok(posts.length >= 2);
  for (const post of posts) {
    assert.equal(new URL(post.link).pathname, '/buzz');
    assert.match(post.media_url, /hoshilu-buzz-ranking-v1\.jpg$/u);
    assert.match(post.caption, /1位|ランキング/u);
    assert.doesNotMatch(post.caption, /最安|No\.?1|Z世代/u);
  }
});

test('AI動画と画像投稿は2週間単位で半分をBUZZにし、毎回テーマと通知を訴求する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-24T00:00:00.000Z'), 28);
  for (const platform of ['X', 'INSTAGRAM']) {
    const videos = posts.filter((post) => post.platform === platform && /\.mp4$/u.test(post.media_url));
    const buzzVideos = videos.filter((post) => new URL(post.link).pathname === '/buzz');
    assert.equal(buzzVideos.length * 2, videos.length, `${platform} video BUZZ ratio`);
    for (const post of buzzVideos) {
      assert.match(post.caption, /今週のHOSHILU BUZZ/u);
      assert.match(post.caption, /無料会員.*(?:火・金|火曜・金曜).*通知/u);
      assert.match(post.caption, /韓国コスメ/u);
      assert.match(post.caption, /Qoo10/u);
      assert.match(post.caption, /SHEIN/u);
    }
  }
  const images = posts.filter((post) => post.platform === 'INSTAGRAM' && /\.(?:jpg|png)$/u.test(post.media_url));
  const buzzImages = images.filter((post) => new URL(post.link).pathname === '/buzz');
  assert.equal(buzzImages.length * 2, images.length, 'Instagram image BUZZ ratio');
  assert.ok(buzzImages.every((post) => /hoshilu-buzz-ranking-v1\.jpg$/u.test(post.media_url)));
});

test('承認済みセラー投稿はX非動画枠へ少量だけ入り/for-sellersへ送客する', () => {
  const posts = buildSocialAutopilotPosts(new Date('2026-08-22T00:00:00.000Z'), 180)
    .filter(post => post.platform === 'X');
  const sellerPosts = posts.filter(post => /^seller-/u.test(post.content_id));
  assert.ok(sellerPosts.length > 0);
  assert.ok(sellerPosts.length / posts.length >= 0.1);
  assert.ok(sellerPosts.length / posts.length <= 0.2);
  assert.deepEqual(new Set(sellerPosts.map(post => post.content_id)), new Set([
    'seller-natural-listing', 'seller-demand-insight', 'seller-business-simple'
  ]));
  for (const post of sellerPosts) {
    const url = new URL(post.link);
    assert.equal(url.pathname, '/for-sellers');
    assert.equal(url.searchParams.get('utm_source'), 'x');
    assert.match(url.searchParams.get('utm_campaign'), /13mall/u);
    assert.doesNotMatch(post.caption, /No\.?1|最安|必ず売れる|売上アップ/u);
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

test('Amazon優先Threads文面は検索先を開くだけと全投稿で明示する', () => {
  const posts = buildThreadsAmazonBoostPosts(new Date('2026-08-17T03:00:00.000Z'), 10);
  const affiliate = posts.filter((post) => post.affiliate);
  assert.ok(affiliate.length > 0);
  for (const post of affiliate) {
    assert.match(post.caption, /HOSHILUからAmazonを含む検索先を開けます/u, post.content_id);
    assert.match(post.caption, /Amazonの商品候補・価格・在庫・レビューはリンク先で確認してください/u, post.content_id);
    assert.doesNotMatch(post.caption, /Amazonを含む(?:複数|各|取扱|対応)[^。]*(?:見比べ|まとめて|比較|確認|候補|在庫)/u, post.content_id);
    assert.doesNotMatch(post.caption, /これAmazon[^。]*他モール[^。]*一緒に確認/u, post.content_id);
  }
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
    X_EXPECTED_USERNAME: 'hoshilu_app',
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
  assert.equal(rows.filter(row => /\.mp4$/u.test(row[6])).every(row => row[10] === 1), true);
  assert.equal(rows.filter(row => !/\.mp4$/u.test(row[6])).every(row => row[10] === 0), true);
  assert.equal(rows.every(row => row[11] === 'APPROVED'), true);
});

test('14日分が50件を超えてもキュー補充は1回のD1 batchにまとめる', async () => {
  let batchCalls = 0;
  let batchedStatements = 0;
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    INSTAGRAM_ACCOUNT_ID: 'ig-account',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    THREADS_ACCESS_TOKEN: 'threads-token',
    THREADS_USER_ID: '123',
    THREADS_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    PRODUCT_DB: {
      prepare(sql) {
        return { bind(...values) { return { sql, values }; } };
      },
      async batch(statements) {
        batchCalls += 1;
        batchedStatements = statements.length;
        return statements.map(() => ({ meta: { changes: 1 } }));
      }
    }
  };
  const result = await seedSocialAutopilotQueue(env, new Date('2026-08-29T03:00:00.000Z'));
  assert.ok(result.planned > 50);
  assert.equal(result.inserted, result.planned);
  assert.equal(batchCalls, 1);
  assert.equal(batchedStatements, result.planned);
});

test('公開履歴がある完成動画の後日再利用はREVIEW_REQUIREDへ隔離するSQLを使う', async () => {
  const statements = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    PRODUCT_DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind() {
            return { async run() { return { meta: { changes: 1 } }; } };
          }
        };
      }
    }
  };
  await seedSocialAutopilotQueue(env, new Date('2026-08-10T00:00:00.000Z'));
  const insert = statements.find(sql => /INSERT INTO social_post_queue/.test(sql));
  assert.ok(insert);
  assert.match(insert, /previous\.media_url=\?7/u);
  assert.match(insert, /previous\.scheduled_at<\?8/u);
  assert.match(insert, /THEN 'REVIEW_REQUIRED' ELSE \?12/u);
  assert.match(insert, /MEDIA_REUSE_REVIEW_REQUIRED/u);
  assert.match(insert, /social_post_queue\.status IN \('APPROVED','REVIEW_REQUIRED'\)/u);
  assert.match(insert, /SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813/u);
  assert.match(insert, /social_post_queue\.external_post_id=''/u);
  assert.match(insert, /social_post_queue\.published_at=''/u);
});

test('完成動画は同時クロスポストだけを承認し、後日の既存APPROVED再利用も隔離する', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE social_post_queue (
    post_id TEXT PRIMARY KEY, platform TEXT NOT NULL, campaign_id TEXT NOT NULL DEFAULT '',
    content_id TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL, link TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '', scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED', affiliate INTEGER NOT NULL DEFAULT 0,
    external_post_id TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '',
    approved_at TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, platform_job_id TEXT NOT NULL DEFAULT ''
  )`);
  class Statement {
    constructor(sql) { this.statement = sqlite.prepare(sql); this.values = []; }
    bind(...values) { this.values = values; return this; }
    async run() {
      const result = this.statement.run(...this.values);
      return { meta: { changes: result.changes } };
    }
    async first() { return this.statement.get(...this.values) || null; }
    async all() { return { results: this.statement.all(...this.values) }; }
  }
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    PRODUCT_DB: { prepare(sql) { return new Statement(sql); } }
  };
  const now = new Date('2026-08-10T00:00:00.000Z');
  await seedSocialAutopilotQueue(env, now);
  const videoRows = sqlite.prepare(`SELECT post_id,platform,scheduled_at,status,last_error,approved_at
    FROM social_post_queue WHERE media_url LIKE '%.mp4' ORDER BY scheduled_at,platform`).all();
  assert.deepEqual(videoRows.slice(0, 2).map(row => row.status), ['APPROVED', 'APPROVED']);
  assert.equal(videoRows.slice(2).every(row => row.status === 'REVIEW_REQUIRED'), true);

  const replay = videoRows[2];
  sqlite.prepare(`UPDATE social_post_queue SET status='APPROVED',approved_at=?2 WHERE post_id=?1`)
    .run(replay.post_id, now.toISOString());
  await seedSocialAutopilotQueue(env, now);
  const quarantined = sqlite.prepare(`SELECT status,last_error,approved_at
    FROM social_post_queue WHERE post_id=?1`).get(replay.post_id);
  assert.deepEqual({ ...quarantined }, {
    status: 'REVIEW_REQUIRED',
    last_error: 'MEDIA_REUSE_REVIEW_REQUIRED',
    approved_at: ''
  });
});

test('過去の一時隔離行だけを再評価し、完成動画の再利用はAPPROVEDへ戻さない', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE social_post_queue (
    post_id TEXT PRIMARY KEY, platform TEXT NOT NULL, campaign_id TEXT NOT NULL DEFAULT '',
    content_id TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL, link TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '', scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED', affiliate INTEGER NOT NULL DEFAULT 0,
    external_post_id TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '',
    approved_at TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, platform_job_id TEXT NOT NULL DEFAULT ''
  )`);
  class Statement {
    constructor(sql) { this.statement = sqlite.prepare(sql); this.values = []; }
    bind(...values) { this.values = values; return this; }
    async run() {
      const result = this.statement.run(...this.values);
      return { meta: { changes: result.changes } };
    }
    async first() { return this.statement.get(...this.values) || null; }
  }
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
    PRODUCT_DB: { prepare(sql) { return new Statement(sql); } }
  };
  const now = new Date('2026-08-10T00:00:00.000Z');
  await seedSocialAutopilotQueue(env, now);
  const firstVideo = sqlite.prepare(`SELECT post_id,media_url FROM social_post_queue
    WHERE media_url LIKE '%.mp4' ORDER BY scheduled_at,platform LIMIT 1`).get();
  sqlite.prepare(`UPDATE social_post_queue SET status='CANCELLED',
    last_error='SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813'`).run();
  // A previous publication of this media makes any later replay require review.
  sqlite.prepare(`UPDATE social_post_queue SET status='PUBLISHED',external_post_id='123',
    published_at='2026-08-09T11:15:01.000Z' WHERE post_id=?1`).run(firstVideo.post_id);
  await seedSocialAutopilotQueue(env, now);
  const rows = sqlite.prepare(`SELECT status,last_error,media_url FROM social_post_queue
    WHERE post_id<>?1 ORDER BY scheduled_at,platform`).all(firstVideo.post_id);
  const staticRows = rows.filter(row => !/\.mp4$/u.test(row.media_url));
  const repeatedVideoRows = rows.filter(row => row.media_url === firstVideo.media_url);
  assert.equal(staticRows.every(row => row.status === 'APPROVED' && row.last_error === ''), true);
  assert.equal(repeatedVideoRows.length > 0, true);
  assert.equal(repeatedVideoRows.every(row => row.status === 'REVIEW_REQUIRED'
    && row.last_error === 'MEDIA_REUSE_REVIEW_REQUIRED'), true);
});

test('販促自動運用は認証未設定の媒体をキューへ入れない', async () => {
  const platforms = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
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
    X_EXPECTED_USERNAME: 'hoshilu_app',
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
  // 承認済みセラー投稿だけは公開LPへ送り、既存の検索ガイドはホーム(/)へ。
  const sellerPosts = posts.filter(post => /^seller-/.test(post.content_id));
  assert.ok(sellerPosts.length > 0);
  for (const post of sellerPosts) assert.equal(new URL(post.link).pathname, '/for-sellers');
  const guidePosts = posts.filter(post => !/^(?:buzz|seller)-/.test(post.content_id));
  assert.ok(guidePosts.length > 0);
  for (const post of guidePosts) assert.equal(new URL(post.link).pathname, '/');
});


test('2026-08-28にユーザーが明示承認したX・Instagramの再利用行だけを再承認対象にする', async () => {
  const rows = [];
  const env = {
    SOCIAL_AUTOPILOT_ENABLED: 'true',
    INSTAGRAM_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_USER_ACCESS_TOKEN: 'x-token',
    X_PUBLISHING_ENABLED: 'true',
    X_EVERGREEN_AUTOPILOT_ENABLED: 'true',
    X_EXPECTED_USERNAME: 'hoshilu_app',
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
  await seedSocialAutopilotQueue(env, new Date('2026-08-27T15:00:00.000Z'));
  const approved = rows.filter(row => row[0] === 'hoshilu-official-13mall-v2-x-2026-08-28'
    || row[0] === 'hoshilu-official-13mall-v2-instagram-2026-08-28');
  assert.equal(approved.length, 2);
  assert.deepEqual(new Set(approved.map(row => row[1])), new Set(['X', 'INSTAGRAM']));
  assert.equal(approved.every(row => row[12] === 1), true);
  assert.equal(rows.filter(row => !approved.includes(row)).every(row => row[12] === 0), true);
});

test('8月28日再公開CIは既知の技術障害2件だけを復旧しInstagramコンテナを保持する', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /\[retry-approved-reel-20260828\]/);
  const update = workflow.split('\n').find(line => line.includes('UPDATE social_post_queue')
    && line.includes('hoshilu-official-13mall-v2-x-2026-08-28')
    && line.includes('hoshilu-official-13mall-v2-instagram-2026-08-28')
    && line.includes('X_MEDIA_FETCH_522')) || '';
  assert.match(update, /status='FAILED'/);
  assert.match(update, /last_error LIKE 'Too many subrequests by single Worker invocation\.%'/);
  assert.match(update, /external_post_id=''/);
  assert.match(update, /published_at=''/);
  assert.doesNotMatch(update.slice(0, update.indexOf(' WHERE ')), /platform_job_id/);
  assert.match(workflow, /Verify both public post URLs/);
});
