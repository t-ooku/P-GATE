import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCREEN_POSTS, applyRealScreens, screenMediaUrls, screenSetsForRow } from '../src/social-screens.mjs';
import { assertSellerMarketingCurrent } from '../src/seller-marketing-guard.mjs';
import { isEligibleSocialAiActressRow } from '../scripts/check-social-ai-actress-sla.mjs';
import { SCREEN_SETS } from '../scripts/build-social-screens.mjs';

// 2026-10-15 大隆さん指示「今後の投稿も、実画像を踏まえて投稿して」
function d1(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      let params = [];
      const api = {
        bind(...values) { params = values; return api; },
        async all() { return { results: statement.all(...params) }; },
        async first() { return statement.get(...params) ?? null; },
        async run() { const info = statement.run(...params); return { meta: { changes: info.changes } }; }
      };
      return api;
    }
  };
}

// applyRealScreens が読む・書く列だけの最小の表（本番の social_post_queue と同じ列名）
function setup() {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE social_post_queue (post_id TEXT PRIMARY KEY, platform TEXT NOT NULL, campaign_id TEXT NOT NULL DEFAULT '',
    content_id TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', media_url TEXT NOT NULL DEFAULT '',
    media_urls TEXT NOT NULL DEFAULT '', scheduled_at TEXT NOT NULL, status TEXT NOT NULL, jst_publish_date TEXT NOT NULL DEFAULT '',
    platform_job_id TEXT NOT NULL DEFAULT '', external_post_id TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  return database;
}

function insert(database, row) {
  const base = { platform: 'INSTAGRAM', campaign_id: 'hoshilu-carousel-v3', caption: '旧本文', link: 'https://hoshilu.app/?utm_source=instagram', media_url: '',
    media_urls: '["https://hoshilu.app/social/carousel/user-price-watch/1.jpg","https://hoshilu.app/social/carousel/user-price-watch/2.jpg"]',
    scheduled_at: '2026-10-17T11:00:00.000Z', status: 'APPROVED', jst_publish_date: '2026-10-17', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
  const value = { ...base, ...row };
  const keys = Object.keys(value);
  database.prepare(`INSERT INTO social_post_queue (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((key) => value[key]));
}

const manifest = (sets) => ({ sets: Object.fromEntries(sets.map((id) => [id, { files: [1, 2, 3, 4, 5].map((n) => ({ file: `${id}/${n}.jpg` })) }])) });
const assets = (body, seen = []) => ({ fetch: async (request) => { seen.push(new URL(request.url).pathname); return body ? Response.json(body) : new Response('', { status: 404 }); } });

test('今日の未投稿のフィード投稿だけを、当日の実画像と本文に差し替える', async () => {
  const database = setup();
  insert(database, { post_id: 'hoshilu-carousel-v3-instagram-2026-10-17', content_id: 'carousel-seller-wanted-now', link: 'https://hoshilu.app/for-sellers?utm_source=instagram' });
  insert(database, { post_id: 'hoshilu-carousel-v3-fallback-instagram-2026-10-17', content_id: 'carousel-user-big-sale-alert', scheduled_at: '2026-10-17T11:15:00.000Z' });
  insert(database, { post_id: 'done', content_id: 'carousel-user-price-watch', status: 'PUBLISHED', published_at: '2026-10-17T10:00:00Z' });
  insert(database, { post_id: 'tomorrow', content_id: 'carousel-user-price-watch', jst_publish_date: '2026-10-18', scheduled_at: '2026-10-18T11:00:00.000Z' });
  insert(database, { post_id: 'threads-x', platform: 'THREADS', content_id: 'seller-start-flow', campaign_id: 'hoshilu-threads-amazon-boost-v1' });
  const seen = [];
  const env = { PRODUCT_DB: d1(database), ASSETS: assets(manifest(['notes', 'buzz', 'seller']), seen) };
  const result = await applyRealScreens(env, new Date('2026-10-17T09:00:00.000Z'));
  assert.equal(result.updated, 2);
  assert.deepEqual(seen, ['/social/screens/20261017/manifest.json']);
  const seller = database.prepare("SELECT * FROM social_post_queue WHERE post_id='hoshilu-carousel-v3-instagram-2026-10-17'").get();
  assert.equal(seller.content_id, 'seller-screens');
  assert.deepEqual(JSON.parse(seller.media_urls), screenMediaUrls('2026-10-17', 'seller'));
  assert.match(seller.link, /^https:\/\/hoshilu\.app\/for-sellers\?/u);
  assert.doesNotMatch(seller.caption, /気になった商品をコメント/u, 'セラー投稿に買い物客向けの一文を付けない');
  assert.doesNotThrow(() => assertSellerMarketingCurrent(seller, {}));
  const user = database.prepare("SELECT * FROM social_post_queue WHERE post_id='hoshilu-carousel-v3-fallback-instagram-2026-10-17'").get();
  assert.match(user.content_id, /^screens-(?:notes|buzz)$/u);
  assert.ok(JSON.parse(user.media_urls).every((url) => url.startsWith('https://hoshilu.app/social/screens/20261017/')));
  for (const id of ['done', 'tomorrow', 'threads-x']) {
    assert.doesNotMatch(database.prepare('SELECT media_urls,media_url FROM social_post_queue WHERE post_id=?').get(id).media_urls, /social\/screens/u, id);
  }
  // もう一度回しても二重に書き換えない
  assert.equal((await applyRealScreens(env, new Date('2026-10-17T09:05:00.000Z'))).updated, 0);
});

test('その日の実画像が無ければ、従来の画像のまま投稿する', async () => {
  const database = setup();
  insert(database, { post_id: 'p1', content_id: 'carousel-user-price-watch' });
  const env = { PRODUCT_DB: d1(database), ASSETS: assets(null) };
  const result = await applyRealScreens(env, new Date('2026-10-17T09:00:00.000Z'));
  assert.equal(result.updated, 0);
  assert.equal(result.reason, 'no_screens_today');
  assert.match(database.prepare("SELECT media_urls FROM social_post_queue WHERE post_id='p1'").get().media_urls, /social\/carousel/u);
  // セラー向けのセットだけ撮れなかった日は、セラー向けの行は従来のまま（ユーザー向けの画面でセラー募集をしない）
  const database2 = setup();
  insert(database2, { post_id: 's1', content_id: 'carousel-seller-wanted-now' });
  const env2 = { PRODUCT_DB: d1(database2), ASSETS: assets(manifest(['notes', 'buzz'])) };
  assert.equal((await applyRealScreens(env2, new Date('2026-10-17T09:00:00.000Z'))).updated, 0);
});

test('Threads の買い物ノート枠は表紙 1 枚だけ実画像にし、本文は変えない', async () => {
  const database = setup();
  insert(database, { post_id: 'hoshilu-media-notes-threads-2026-10-22', platform: 'THREADS', campaign_id: 'hoshilu-media-notes', content_id: 'media-user-media-ranking-price',
    caption: 'Threads本文', media_url: 'https://hoshilu.app/social/carousel/user-media-ranking-price/1.jpg', media_urls: '', jst_publish_date: '2026-10-22', scheduled_at: '2026-10-22T11:00:00.000Z' });
  const env = { PRODUCT_DB: d1(database), ASSETS: assets(manifest(['notes'])) };
  assert.equal((await applyRealScreens(env, new Date('2026-10-22T09:30:00.000Z'))).updated, 1);
  const row = database.prepare('SELECT * FROM social_post_queue').get();
  assert.equal(row.media_url, 'https://hoshilu.app/social/screens/20261022/notes/1.jpg');
  assert.equal(row.caption, 'Threads本文');
});

test('実画像の本文: 商品の価格・割引率を書かない／セラー向けは現行条件の注意書きを含む', () => {
  for (const id of ['notes', 'buzz']) {
    assert.doesNotMatch(SCREEN_POSTS[id].caption, /[¥￥]|\d+\s*円|\d+\s*[%％]|最安|必ず|保証/u, id);
  }
  assert.match(SCREEN_POSTS.seller.caption, /30日間無料/u);
  assert.match(SCREEN_POSTS.seller.caption, /カード登録/u);
  assert.match(SCREEN_POSTS.seller.caption, /自動更新/u);
  assert.match(SCREEN_POSTS.seller.caption, /準備中/u);
  assert.match(SCREEN_POSTS.seller.caption, /「PR」枠/u);
  assert.doesNotMatch(SCREEN_POSTS.seller.caption, /ショップページ|クーポン|売上が上がる|必ず売れる/u);
  assert.deepEqual(screenSetsForRow({ content_id: 'carousel-seller-demand-visible' }, '2026-10-17'), ['seller']);
  assert.deepEqual(screenSetsForRow({ campaign_id: 'hoshilu-media-notes', content_id: 'media-user-media-price-drops' }, '2026-10-22'), ['notes', 'buzz']);
  // 撮影側: セラー向けは HOSHILU 自身の料金を見せる（ぼかさない）。ユーザー向けはぼかす
  assert.ok(SCREEN_SETS.seller.every((slide) => slide.mask === false));
  assert.ok([...SCREEN_SETS.notes, ...SCREEN_SETS.buzz].every((slide) => slide.mask !== false));
});

test('在庫監視（SLA）は実画像に差し替えたカルーセル行も数える', () => {
  const date = '2026-10-17';
  const row = {
    post_id: `hoshilu-carousel-v3-instagram-${date}`, platform: 'INSTAGRAM', campaign_id: 'hoshilu-carousel-v3', content_id: 'seller-screens', status: 'APPROVED',
    scheduled_at: `${date}T11:00:00.000Z`, queue_approved_at: '2026-10-01T00:00:00.000Z', jst_publish_date: date, crosspost_group_id: `hoshilu-carousel-${date}`,
    queue_media_url: '', queue_media_urls: JSON.stringify(screenMediaUrls(date, 'seller'))
  };
  assert.equal(isEligibleSocialAiActressRow(row, { asOf: `${date}T09:30:00.000Z` }), true);
  assert.equal(isEligibleSocialAiActressRow({ ...row, queue_media_urls: JSON.stringify(screenMediaUrls(date, 'other')) }, { asOf: `${date}T09:30:00.000Z` }), false);
});
