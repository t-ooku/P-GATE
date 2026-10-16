import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCREEN_POSTS, applyRealScreens, screenMediaUrls, screenSetsForRow } from '../src/social-screens.mjs';
import { assertSellerMarketingCurrent } from '../src/seller-marketing-guard.mjs';
import { isEligibleSocialAiActressRow } from '../scripts/check-social-ai-actress-sla.mjs';
import { readFileSync } from 'node:fs';
import { SCREEN_SETS, BLUR_CSS, PHOTO_SELECTORS, PHOTO_BAND_RATIO, applyPhotoBands, PHOTO_OCR_TEXT, photoIndexesWithPriceText, phoneBox } from '../scripts/build-social-screens.mjs';

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
  // 撮影側: 出品者向けページ（HOSHILU 自身の料金）はぼかさない。本番の検索・売れ筋の画面（他店の価格が出る）はぼかす。ユーザー向けはぼかす
  // 2026-10-16 大隆さん「肝心なリアル画像が全ページ見切れてる」: 出品者向けセットは本番の画面の部品を撮る（下の fit のテスト）
  for (const slide of SCREEN_SETS.seller) {
    if (slide.url.startsWith('/for-sellers')) assert.equal(slide.mask, false, slide.id);
    else assert.notEqual(slide.mask, false, slide.id);
  }
  assert.ok([...SCREEN_SETS.notes, ...SCREEN_SETS.buzz].every((slide) => slide.mask !== false));
});

test('出品者向けカルーセル: 実画面は枠で切らない（部品の上端〜下端を撮り、枠をその大きさに合わせる）', () => {
  // 予約済みの投稿が 1〜7 枚目を使うので 7 枚のまま
  assert.equal(SCREEN_SETS.seller.length, 7);
  for (const slide of SCREEN_SETS.seller) {
    assert.equal(slide.fit, true, slide.id);
    assert.ok(!slide.fromTop && !slide.section, `${slide.id} はページの上から決まった高さで撮らない`);
    assert.doesNotMatch(slide.selector, /^main$|\.real-screen$/u, `${slide.id} は出品者向けページをスマホ枠ごと撮らない`);
  }
  // 1 枚目は掲載見本（PR 枠）
  assert.equal(SCREEN_SETS.seller[0].prSample, true);
  // 枠は 820×760 の中に全体が入る（縦長は細く、横長は低く）
  const tall = phoneBox({ width: 390, height: 700 });
  assert.ok(tall.height <= 760 && tall.width <= 820);
  assert.equal(tall.height, 760);
  const short = phoneBox({ width: 390, height: 200 });
  assert.equal(short.width, 820);
  assert.ok(short.height < 760 && short.top > 520, '低い部品は縦の真ん中に置く');
  assert.equal(Math.round(short.height / short.width * 390), 200, '縦横の比は変えない');
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

test('商品写真に焼き込まれた価格・割引率（例: 写真右下の「クーポン利用で10%OFF」）も、写真の下帯ぼかしで隠す', () => {
  // 2026-10-16 Codex 点検: screens/20261015/notes/2.jpg の写真内「10%OFF」が DOM のぼかしでは隠れなかった
  const media = readFileSync(new URL('../src/owned-media.mjs', import.meta.url), 'utf8');
  const buzz = readFileSync(new URL('../public/buzz-home.mjs', import.meta.url), 'utf8');
  // 2026-10-16: 出品者向けページ用の検索結果（app.js の商品カードの写真枠）も対象
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  // 2026-10-16: 掲載見本（検索結果の PR 枠の写真）も対象
  const unified = readFileSync(new URL('../public/unified-results-ui.mjs', import.meta.url), 'utf8');
  for (const selector of PHOTO_SELECTORS) {
    const name = selector.replace(/^\./u, '');
    assert.ok(media.includes(`class="${name}"`) || buzz.includes(`'${name}'`) || app.includes(`className='${name}'`) || unified.includes(`el('div', '${name}')`), `撮影対象の写真枠 ${selector} が本番の画面に存在する`);
  }
  for (const name of ['media-drop-figure', 'media-tile-figure', 'buzz-home-thumb']) assert.ok(PHOTO_SELECTORS.includes(`.${name}`), name);
  // 写真の下側 30% を必ず覆う（販促帯の位置）。写真全体は消さない
  assert.ok(PHOTO_BAND_RATIO >= 0.25 && PHOTO_BAND_RATIO <= 0.4, String(PHOTO_BAND_RATIO));
  const band = BLUR_CSS.match(/\.hoshilu-photo-band\{([^}]*)\}/u)?.[1] || '';
  assert.match(band, /clip-path:inset\((\d+)% 0 0 0\)/u);
  assert.equal(Number(band.match(/clip-path:inset\((\d+)%/u)[1]), Math.round((1 - PHOTO_BAND_RATIO) * 100));
  // 端でぼかしが透けて元の文字が見えないよう、下地は不透明
  assert.match(band, /background:#fff!important/u);
  const copy = BLUR_CSS.match(/\.hoshilu-photo-band img\{([^}]*)\}/u)?.[1] || '';
  assert.match(copy, /filter:blur\((\d+)px\)/u);
  assert.ok(Number(copy.match(/blur\((\d+)px\)/u)[1]) >= 10, 'ぼかしが弱すぎると数字が読める');
  assert.match(copy, /transform:scale\(1\.[1-9]/u, '複製を拡大して端の透けを外に出す');
  // 撮影ページで動く関数は外部の変数に頼らない（page.evaluate で直列化される）
  assert.equal(typeof applyPhotoBands, 'function');
  assert.doesNotMatch(String(applyPhotoBands), /PHOTO_|BLUR_CSS|PRICE_/u);
  // ユーザー向け（写真が写る）セットは全部ぼかし対象。セラー向けは出品者向けページ（HOSHILU 自身の料金）だけぼかさない
  assert.ok(SCREEN_SETS.seller.filter((slide) => slide.url.startsWith('/for-sellers')).every((slide) => slide.mask === false));
  assert.ok(SCREEN_SETS.seller.filter((slide) => !slide.url.startsWith('/for-sellers')).every((slide) => slide.mask !== false));
});

test('写真の下帯ぼかしが 1 枚でも効いていなければ、そのセットは出さない（撮影スクリプトの止め）', () => {
  const source = readFileSync(new URL('../scripts/build-social-screens.mjs', import.meta.url), 'utf8');
  assert.match(source, /PHOTO_PRICE_NOT_MASKED/u);
  assert.equal((source.match(/photo\.masked < photo\.photos\) throw/gu) || []).length, 2, '撮影前と撮影直前の 2 回数える');
  assert.match(source, /photo_band_masked/u, 'manifest に写真の枚数と下帯ぼかし済みの枚数を残す');
});

test('写真の上側に焼き込まれた価格（例: 20261016/buzz/3.jpg 左上「50%OFF 3,850円」）は、端末内 OCR で読めた写真だけ全体ぼかし', () => {
  // 価格・割引率だけを数える。順位バッジの読み違い（30位→304%）や日付・号数・容量は数えない
  for (const word of ['OFF', '%OFF', '3,850.', '¥1980', '980円', '12,800']) assert.match(word, PHOTO_OCR_TEXT, word);
  for (const word of ['304%', '4%', '10/17', '9:59', '2026.10.16', '350mL', '1位', 'NILE', 'P10']) assert.doesNotMatch(word, PHOTO_OCR_TEXT, word);
  const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  const word = (left, top, text) => ['5', '1', '1', '1', '1', '1', left, top, 60, 30, '90', text].join('\t');
  // 撮影は 3 倍。写真 0: x 12–182, 写真 1: x 190–360（CSS px）
  const rects = [{ x: 12, y: 50, width: 170, height: 170 }, { x: 190, y: 50, width: 170, height: 170 }];
  const tsv = [header, word(600, 200, 'OFF'), word(600, 260, '3,850.'), word(100, 200, '304%'), word(100, 800, '12,800')].join('\n');
  const result = photoIndexesWithPriceText(tsv, rects, 3);
  assert.deepEqual(result.indexes, [1]);
  assert.deepEqual(result.words.map((w) => [w.text, w.inPhoto]), [['OFF', true], ['3,850.', true], ['12,800', false]]);
  assert.deepEqual(photoIndexesWithPriceText('', rects).indexes, []);
  // 全体ぼかしは読めた写真だけ（下帯ぼかしは全写真のまま）。SOCIAL_SCREENS_REQUIRE_OCR=1 なら OCR が無ければ止める。無い時は manifest に unavailable
  assert.match(BLUR_CSS, /\.hoshilu-photo-full>\.hoshilu-photo-band\{clip-path:inset\(0 0 0 0\)!important\}/u);
  const source = readFileSync(new URL('../scripts/build-social-screens.mjs', import.meta.url), 'utf8');
  assert.match(source, /PHOTO_OCR_UNAVAILABLE/u);
  assert.match(source, /PHOTO_PRICE_OCR_REMAINS/u);
  assert.match(source, /photo_ocr: shots\[index\]\.photoOcr/u);
  assert.doesNotMatch(source, /https?:\/\/[^'"`\s]*(?:ocr|vision)/iu);
  assert.match(source, /ocr: 'unavailable'/u);
});
