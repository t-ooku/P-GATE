import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEASON_CALENDAR, seasonFor, isSeasonalProduct } from '../src/season-calendar.mjs';
import { screenCaption, SCREEN_POSTS } from '../src/social-screens.mjs';
import { withDropFocus, handleTopDropsApi, TOP_DROPS_PATH } from '../src/owned-media.mjs';

// 2026-10-20 大隆さん「販促は季節やトレンドを読むこと大切よ。調べたり感じたりして SNS やブラウザで販促していってね」

test('季節: 日本時間の日付で決まり、期間外は null', () => {
  assert.equal(seasonFor(new Date('2026-10-20T03:00:00Z')).id, 'autumn_change');
  assert.equal(seasonFor(new Date('2026-10-31T14:59:00Z')).id, 'autumn_change', '10/31 23:59 JST');
  assert.equal(seasonFor(new Date('2026-10-31T15:00:00Z')).id, 'winter_prep', '11/1 0:00 JST');
  assert.equal(seasonFor(new Date('2026-11-20T03:00:00Z')).id, 'black_friday');
  assert.equal(seasonFor(new Date('2026-12-24T03:00:00Z')).id, 'christmas');
  assert.equal(seasonFor(new Date('2026-12-30T03:00:00Z')).id, 'year_end');
  assert.equal(seasonFor(new Date('2027-01-10T03:00:00Z')), null);
  assert.equal(seasonFor(new Date('2026-09-01T03:00:00Z')), null);
});

test('季節: 期間は重ならず、一言に数字・セールの日付・約束を書かない。例は 9 個（日替わり 3 個ずつ）', () => {
  const sorted = [...SEASON_CALENDAR].sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 1; i < sorted.length; i += 1) assert.ok(sorted[i - 1].to < sorted[i].from, `${sorted[i - 1].id} と ${sorted[i].id} が重なる`);
  for (const season of SEASON_CALENDAR) {
    for (const text of [season.hook, season.top_line]) {
      assert.doesNotMatch(text, /[0-9０-９]|%|％|円|最安|必ず|絶対|お得になる|買い時/u, `${season.id}: ${text}`);
    }
    assert.ok(season.top_line.length <= 40, `${season.id}: トップの一言は短く`);
    assert.match(season.tags, /^(#[^\s#]+ ?)+$/u);
    assert.equal(season.examples.length, 9);
    assert.equal(new Set(season.examples).size, 9);
  }
  assert.ok(isSeasonalProduct('ツイード ニット カーディガン', seasonFor(new Date('2026-10-20T03:00:00Z'))));
  assert.ok(!isSeasonalProduct('フライパン 26cm', seasonFor(new Date('2026-10-20T03:00:00Z'))));
  assert.ok(!isSeasonalProduct('ニット', null));
});

test('トップの例: app.js の時期別の例は season-calendar.mjs と同じ（期間外は従来の例）', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const table = new Function(`${app.match(/const SEASON_EXAMPLES=[^\n]*\n/u)[0]}; return SEASON_EXAMPLES;`)();
  assert.deepEqual(table, SEASON_CALENDAR.map((season) => [season.from, season.to, [...season.examples]]));
  assert.match(app, /const pool=\(language==='JA'&&seasonExamples\(\)\)\|\|\(copy\[language\]\|\|copy\.JA\)\.examples\|\|\[\];/u);
  const seasonExamples = new Function(`${app.match(/const SEASON_EXAMPLES=[^\n]*\n/u)[0]}${app.match(/function seasonExamples\([^\n]*\n/u)[0]}; return seasonExamples;`)();
  assert.deepEqual(seasonExamples(Date.parse('2026-10-20T03:00:00Z')), [...SEASON_CALENDAR[0].examples]);
  assert.equal(seasonExamples(Date.parse('2027-02-01T03:00:00Z')), null);
});

test('Instagram の値下がり投稿: 2 行目に季節の一言、最後のタグに季節のタグ。ほかのセット・期間外は従来の本文', () => {
  const now = new Date('2026-10-20T03:00:00Z');
  const caption = screenCaption('drops', now);
  const lines = caption.split('\n');
  assert.equal(lines[0], SCREEN_POSTS.drops.caption.split('\n')[0]);
  assert.equal(lines[1], seasonFor(now).hook);
  assert.ok(lines.at(-1).endsWith(seasonFor(now).tags));
  assert.ok((lines.at(-1).match(/#/gu) || []).length <= 30, 'Instagram のタグは 30 個まで');
  assert.ok(caption.length < 2200);
  assert.equal(screenCaption('notes', now), SCREEN_POSTS.notes.caption);
  assert.equal(screenCaption('drops', new Date('2027-02-01T03:00:00Z')), SCREEN_POSTS.drops.caption);
  const source = readFileSync(new URL('../src/social-screens.mjs', import.meta.url), 'utf8');
  assert.match(source, /caption: screenCaption\('drops', now\)/u, '毎日の値下がり投稿');
  assert.match(source, /caption: screenCaption\(setId, now\)/u, '実画像への差し替え');
});

test('値下がりの並び: 季節の物（商品名の目印）を各ジャンルの中で先に出す', () => {
  const row = (key, category, name) => ({ record_key: key, marketplace: 'RAKUTEN_JP', product_name: name, category_id: category, drop_rate: 20,
    latest_price: 800, max_price: 1000, image_url: 'https://img.example/a.jpg', history: [] });
  const drops = [row('t', 'womens_fashion', 'Tシャツ 半袖'), row('k', 'womens_fashion', 'ツイード風 カーディガン'), row('p', 'womens_fashion', 'デニムパンツ'),
    row('d', 'kitchen', 'フライパン'), row('h', 'kitchen', '卓上 加湿器')];
  const order = (list) => list.filter((item) => item.focus).sort((a, b) => a.focus - b.focus).map((item) => item.record_key);
  assert.deepEqual(order(withDropFocus(drops, 8, 0, seasonFor(new Date('2026-10-20T03:00:00Z')))), ['k', 't', 'h', 'p', 'd']);
  assert.deepEqual(order(withDropFocus(drops, 8, 0, null)), ['t', 'k', 'd', 'p', 'h'], '期間外は従来どおり');
});

test('トップの「今日の値下がり」: 季節の一言を返す（期間外は空）', async () => {
  const inSeason = await (await handleTopDropsApi(new Request(`https://hoshilu.app${TOP_DROPS_PATH}`), {}, { cache: null, now: new Date('2026-10-20T03:00:00Z') })).json();
  assert.equal(inSeason.season, SEASON_CALENDAR[0].top_line);
  const off = await (await handleTopDropsApi(new Request(`https://hoshilu.app${TOP_DROPS_PATH}`), {}, { cache: null, now: new Date('2027-02-01T03:00:00Z') })).json();
  assert.equal(off.season, '');
  const front = readFileSync(new URL('../public/top-drops.mjs', import.meta.url), 'utf8');
  assert.match(front, /el\('p', 'top-drops-season', seasonText\)/u, '季節の一言は textContent で入れる');
});

// 2026-10-20 大隆さん「週1回は割引のフィード広告じゃない投稿して」
test('週 1 回（木曜）は割引ではない投稿: ホシルバズに差し替え、値下がり投稿は足さない。本文に値下がり・セールの一言を入れない', async () => {
  const { isWeeklyTrendDay, screenSetsForRow, seedDailyDropsPost } = await import('../src/social-screens.mjs');
  assert.equal(isWeeklyTrendDay('2026-10-22'), true, '10/22 は木曜');
  assert.equal(isWeeklyTrendDay('2026-10-21'), false);
  assert.deepEqual(screenSetsForRow({ content_id: 'media-user-media-ranking-price' }, '2026-10-22'), ['buzz', 'notes']);
  assert.deepEqual(screenSetsForRow({ content_id: 'carousel-user-price-watch' }, '2026-10-21'), ['drops', 'buzz', 'notes']);
  assert.deepEqual(screenSetsForRow({ content_id: 'carousel-seller-x', link: 'https://hoshilu.app/for-sellers' }, '2026-10-22'), ['seller']);
  const result = await seedDailyDropsPost({ PRODUCT_DB: {} }, new Date('2026-10-22T03:00:00Z'));
  assert.equal(result.reason, 'weekly_trend_day');
  for (const season of SEASON_CALENDAR) {
    assert.doesNotMatch(`${season.trend_hook} ${season.trend_tags}`, /値下|割引|セール価格|お得|最安|%|％|[0-9０-９]/u, season.id);
    assert.match(season.trend_tags, /^(#[^\s#]+ ?)+$/u);
  }
  const caption = screenCaption('buzz', new Date('2026-10-22T03:00:00Z'));
  assert.equal(caption.split('\n')[1], SEASON_CALENDAR[0].trend_hook);
  assert.ok(caption.split('\n').at(-1).endsWith(SEASON_CALENDAR[0].trend_tags));
});
