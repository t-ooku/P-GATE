// 2026-10-14 大隆さん指示「オウンドメディア作って」: ホシルの買い物ノート（/media・/media/price-drops）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  DROP_RULES, MEDIA_PATHS, MEDIA_SECTIONS, handleOwnedMediaRoutes, loadPopularArticles, loadPriceDrops, renderMediaTop, renderPriceDrops
} from '../src/owned-media.mjs';
import { seoArticleCard } from '../src/seo-pages.mjs';

function envWith(seed = () => {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0093_price_observations.sql', import.meta.url), 'utf8'));
  db.exec(`CREATE TABLE growth_events (event_type TEXT, traffic_class TEXT, content TEXT, occurred_at TEXT)`);
  seed(db);
  return { PRODUCT_DB: { prepare(sql) { const st = db.prepare(sql); let values = [];
    return { bind(...v) { values = v; return this; }, async all() { return { results: st.all(...values) }; } }; } } };
}
const NOW = new Date('2026-10-14T03:00:00Z'); // JST 12:00
function observe(db, { id, date, price, source = 'rakuten_ranking_api', stock = 'IN_STOCK', name = '保冷 水筒 500ml' }) {
  db.prepare(`INSERT INTO price_observations (observation_key, record_key, jan, marketplace, external_product_id, seller_id, product_name, product_url,
    price, shipping, total, stock_status, source, observed_date, observed_at) VALUES (?,?,'', 'RAKUTEN_JP', ?, 'shop', ?, 'https://item.rakuten.co.jp/shop/x/', ?, NULL, NULL, ?, ?, ?, ?)`)
    .run(`RAKUTEN_JP|${id}|shop|${date}`, `RAKUTEN:${id}`, id, name, price, stock, source, date, `${date}T00:00:00Z`);
}

test('値下がりは「3日以上の記録・最高値から10%以上・最後の確認が2日以内・公式ランキング経由」だけ。大きい順', async () => {
  const env = envWith((db) => {
    // 20% 下がった（載る）
    observe(db, { id: 'shop:a', date: '2026-10-08', price: 3000 }); observe(db, { id: 'shop:a', date: '2026-10-10', price: 2800 }); observe(db, { id: 'shop:a', date: '2026-10-13', price: 2400 });
    // 12% 下がった（載る・2 番目）
    observe(db, { id: 'shop:b', date: '2026-10-09', price: 1000 }); observe(db, { id: 'shop:b', date: '2026-10-11', price: 950 }); observe(db, { id: 'shop:b', date: '2026-10-14', price: 880 });
    // 記録 2 日だけ（載らない）
    observe(db, { id: 'shop:c', date: '2026-10-12', price: 1000 }); observe(db, { id: 'shop:c', date: '2026-10-14', price: 500 });
    // 利用者の検索だけで記録（載らない）
    for (const [d, p] of [['2026-10-08', 1000], ['2026-10-10', 900], ['2026-10-13', 700]]) observe(db, { id: 'shop:d', date: d, price: p, source: 'search' });
    // 最後の確認が古い（載らない）
    for (const [d, p] of [['2026-10-03', 1000], ['2026-10-05', 900], ['2026-10-08', 700]]) observe(db, { id: 'shop:e', date: d, price: p });
    // 80% 下がった（取り違えを疑って載らない）
    for (const [d, p] of [['2026-10-08', 10000], ['2026-10-10', 9000], ['2026-10-13', 2000]]) observe(db, { id: 'shop:f', date: d, price: p });
    // 売り切れ（載らない）
    for (const [d, p] of [['2026-10-08', 1000], ['2026-10-10', 900], ['2026-10-13', 700]]) observe(db, { id: 'shop:g', date: d, price: p, stock: d === '2026-10-13' ? 'OUT_OF_STOCK' : 'IN_STOCK' });
  });
  const drops = await loadPriceDrops(env, { now: NOW });
  assert.deepEqual(drops.map((d) => [d.record_key, d.drop_rate]), [['RAKUTEN:shop:a', 20], ['RAKUTEN:shop:b', 12]]);
  assert.equal(drops[0].max_date, '2026-10-08');
  assert.equal(drops[0].latest_date, '2026-10-13');
  assert.equal(DROP_RULES.minDropRate, 0.10);
});

test('表が無い・読めない時は null（0 件とは区別して「読み込めませんでした」と出す）', async () => {
  assert.equal(await loadPriceDrops({}, { now: NOW }), null);
  assert.match(renderPriceDrops({ drops: null, now: NOW }), /価格の記録を読み込めませんでした/);
  assert.match(renderPriceDrops({ drops: [], now: NOW }), /条件に合う大きな値下がりはありませんでした/);
});

test('値下がりページ: 決まり・記録開始日・確認時点の価格・広告表記を出し、予想や「最安」は書かない。3件未満は索引させない', () => {
  const row = { record_key: 'RAKUTEN:shop:a', marketplace: 'RAKUTEN_JP', product_name: '保冷 水筒 <500ml>', latest_price: 2400, latest_date: '2026-10-13', max_price: 3000, max_date: '2026-10-08', days: 3, drop_rate: 20 };
  const one = renderPriceDrops({ drops: [row], now: NOW });
  assert.match(one, /noindex,follow/);
  assert.match(one, /2026-10-03から始まっています/);
  assert.match(one, /これから上がるか下がるかの予想はしていません/);
  assert.match(one, /広告（アフィリエイト）を含みます/);
  assert.match(one, /保冷 水筒 &lt;500ml&gt;/, '商品名はエスケープする');
  assert.match(one, /href="\/product\?key=RAKUTEN%3Ashop%3Aa&amp;from=media"|href="\/product\?key=RAKUTEN%3Ashop%3Aa&from=media"/);
  assert.doesNotMatch(one, /最安(?:値)?です|今が買い時|必ず/);
  const three = renderPriceDrops({ drops: [row, { ...row, record_key: 'RAKUTEN:shop:b' }, { ...row, record_key: 'RAKUTEN:shop:c' }], now: NOW });
  assert.match(three, /index,follow,max-image-preview/);
});

test('トップ: 目的別の記事はすべて実在し、読まれている記事は実在する記事だけを出す', async () => {
  for (const section of MEDIA_SECTIONS) for (const slug of section.slugs) assert.ok(seoArticleCard(slug), slug);
  const env = envWith((db) => {
    const ins = db.prepare(`INSERT INTO growth_events VALUES ('seo_article_view', ?, ?, datetime('now','-1 day'))`);
    for (let i = 0; i < 5; i += 1) ins.run('ATTRIBUTED', 'find-product-without-name');
    for (let i = 0; i < 9; i += 1) ins.run('QA', 'compare-amazon-and-rakuten');
    ins.run('ATTRIBUTED', 'not-an-article');
  });
  const popular = await loadPopularArticles(env);
  assert.deepEqual(popular.map((card) => card.slug), ['find-product-without-name'], 'QA と実在しない記事は除く');
  const html = renderMediaTop({ drops: [], popular, now: NOW });
  assert.match(html, /<title>ホシルの買い物ノート/);
  assert.match(html, /data-seo-article-id="media-top"/);
  assert.match(html, /seo-article-analytics\.mjs/);
  assert.match(html, /data-seo-search-form/);
  assert.match(html, /href="\/media\/price-drops"|今週は、条件に合う大きな値下がりはありませんでした/);
});

test('ルート: /media と /media/price-drops だけを返し、セキュリティヘッダーを付ける', async () => {
  const env = envWith();
  const top = await handleOwnedMediaRoutes(new Request('https://hoshilu.app/media'), env, { headers: { 'x-frame-options': 'DENY' }, now: NOW, cache: null });
  assert.equal(top.status, 200);
  assert.equal(top.headers.get('x-frame-options'), 'DENY');
  assert.match(top.headers.get('cache-control'), /max-age=1800/);
  assert.ok(await handleOwnedMediaRoutes(new Request('https://hoshilu.app/media/price-drops/'), env, { now: NOW, cache: null }));
  assert.equal(await handleOwnedMediaRoutes(new Request('https://hoshilu.app/media/other'), env, { now: NOW, cache: null }), null);
  assert.equal(await handleOwnedMediaRoutes(new Request('https://hoshilu.app/media', { method: 'POST' }), env, { now: NOW, cache: null }), null);
  assert.deepEqual(MEDIA_PATHS, ['/media', '/media/price-drops']);
  const worker = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(worker, /handleOwnedMediaRoutes\(request, env, \{ headers: DOCUMENT_SECURITY_HEADERS \}\)/);
});

test('サイトマップ・ガイド一覧・トップのフッターから買い物ノートへ入れる', () => {
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const path of MEDIA_PATHS) assert.match(sitemap, new RegExp(`<loc>https://hoshilu\\.app${path}</loc>`));
  assert.match(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /<a href="\/media">買い物ノート<\/a>/);
  assert.match(readFileSync(new URL('../src/seo-pages.mjs', import.meta.url), 'utf8'), /<a href="\/media">ホシルの買い物ノート/);
});

test('記事の流入元は参照元のホスト名だけで固定の分類にする（パス・クエリは送らない）', async () => {
  const source = readFileSync(new URL('../public/seo-article-analytics.mjs', import.meta.url), 'utf8');
  assert.match(source, /event_type: 'seo_article_landing'/);
  assert.match(source, /new URL\(referrer\)\.hostname/);
  assert.doesNotMatch(source, /referrer\)\.(pathname|search)|document\.referrer\.slice/);
  const events = readFileSync(new URL('../src/growth-events.mjs', import.meta.url), 'utf8');
  assert.match(events, /'seo_article_landing',/);
});

// 2026-10-14 大隆さん「君はオシャレにできる？」: 雑誌の体裁（号数・数字の帯・番号付きの記事）。
test('見た目: 号数・数字の帯・番号付きの値下がりと記事。CSS は .media-page の中だけに効く', () => {
  const html = renderMediaTop({ drops: [{ record_key: 'RAKUTEN:s:a', marketplace: 'RAKUTEN_JP', product_name: '水筒', latest_price: 900, latest_date: '2026-10-14', max_price: 1000, max_date: '2026-10-08', days: 4, drop_rate: 10 }], popular: [], now: NOW });
  assert.match(html, /<body class="media-page"/);
  assert.match(html, /2026\.10\.14 号/);
  assert.match(html, /<dl class="media-stats">/);
  assert.match(html, /<span class="media-drop-rank" aria-hidden="true">01<\/span>/);
  assert.match(html, /<b>-10<\/b>%/);
  assert.match(html, /owned-media\.css\?v=5/);
  const css = readFileSync(new URL('../public/owned-media.css', import.meta.url), 'utf8');
  for (const rule of css.match(/^[^@\s/}][^{]*\{/gmu) || []) {
    assert.ok(/\.media-|^\s*\.media-page/u.test(rule), `scoped: ${rule}`);
  }
});

// 2026-10-14 大隆さん「商品画像も表示して。人は視認性が大切よ。あと価格履歴ね」
import { largerImage, loadPriceHistories, loadRankingImages, sparkline, withImagesAndHistory } from '../src/owned-media.mjs';

test('画像はモール公式ランキングの保存データから record_key で引く（無ければ画像なしの枠。別の商品で埋めない）', async () => {
  const env = envWith((db) => {
    db.exec(readFileSync(new URL('../migrations/0045_marketplace_ranking.sql', import.meta.url), 'utf8'));
    db.prepare(`INSERT INTO marketplace_ranking_cache VALUES ('RAKUTEN_JP','kitchen','REALTIME',?, '2026-10-01T00:00:00Z','2026-10-14T00:00:00Z')`)
      .run(JSON.stringify([{ record_key: 'RAKUTEN:shop:a', image_url: 'https://thumbnail.image.rakuten.co.jp/@0_mall/shop/a.jpg?_ex=128x128' }, { record_key: 'RAKUTEN:shop:z', image_url: 'http://insecure.example/z.jpg' }]));
    observe(db, { id: 'shop:a', date: '2026-10-10', price: 3000 }); observe(db, { id: 'shop:a', date: '2026-10-13', price: 2400 });
  });
  const images = await loadRankingImages(env, ['RAKUTEN:shop:a', 'RAKUTEN:shop:b', 'RAKUTEN:shop:z']);
  assert.equal(images.get('RAKUTEN:shop:a'), 'https://thumbnail.image.rakuten.co.jp/@0_mall/shop/a.jpg?_ex=300x300', '期限切れの保存データでも画像は使う・300px を求める');
  assert.equal(images.has('RAKUTEN:shop:b'), false);
  assert.equal(images.has('RAKUTEN:shop:z'), false, 'https 以外は使わない');
  assert.equal(largerImage('javascript:alert(1)'), '');
  const histories = await loadPriceHistories(env, ['RAKUTEN:shop:a'], { now: NOW });
  assert.deepEqual(histories.get('RAKUTEN:shop:a'), [{ date: '2026-10-10', price: 3000 }, { date: '2026-10-13', price: 2400 }]);
  const [row] = await withImagesAndHistory(env, [{ record_key: 'RAKUTEN:shop:a', product_name: 'x' }], { now: NOW });
  assert.match(row.image_url, /_ex=300x300/);
  assert.equal(row.history.length, 2);
});

test('価格履歴の折れ線: 記録した日だけで描き、読み上げ用の文に全日の価格を入れる。1日しか無ければ描かない', () => {
  assert.equal(sparkline([{ date: '2026-10-13', price: 100 }]), '');
  const svg = sparkline([{ date: '2026-10-10', price: 3000 }, { date: '2026-10-12', price: 2800 }, { date: '2026-10-13', price: 2400 }]);
  assert.match(svg, /<svg class="media-spark"[^>]*role="img"/);
  assert.match(svg, /aria-label="価格の推移（3日分の記録）: 10\/10 ¥3,000、10\/12 ¥2,800、10\/13 ¥2,400"/);
  assert.doesNotMatch(svg, /style=/, 'CSP（style-src self）に合わせ style 属性は使わない');
  const html = renderPriceDrops({ drops: [{ record_key: 'RAKUTEN:shop:a', marketplace: 'RAKUTEN_JP', product_name: '水筒', latest_price: 2400, latest_date: '2026-10-13', max_price: 3000, max_date: '2026-10-10', days: 3, drop_rate: 20,
    image_url: 'https://thumbnail.image.rakuten.co.jp/a.jpg?_ex=300x300', history: [{ date: '2026-10-10', price: 3000 }, { date: '2026-10-13', price: 2400 }] }], now: NOW });
  assert.match(html, /<img src="https:\/\/thumbnail\.image\.rakuten\.co\.jp\/a\.jpg\?_ex=300x300" alt="" loading="eager"[^>]*referrerpolicy="no-referrer"/);
  assert.match(html, /<span class="media-drop-history-label">価格の推移<\/span><svg/);
  assert.match(html, /<span class="media-spark-axis"><span>10\/10<\/span><span>10\/13<\/span><\/span>/);
  assert.match(html, /今の価格と履歴を見る/);
});

// 2026-10-14: 30 分の保存の鍵に作りの版を入れる（反映直後に古い作りのページを出し続けた）。
import { MEDIA_TEMPLATE_VERSION } from '../src/owned-media.mjs';
test('保存の鍵に作りの版を入れ、版は CSS の版と揃える', async () => {
  const keys = [];
  const cache = { async match(request) { keys.push(request.url); return undefined; }, async put() {} };
  await handleOwnedMediaRoutes(new Request('https://hoshilu.app/media'), envWith(), { now: NOW, cache });
  assert.match(keys[0], new RegExp(`media-cache=2026-10-14&v=${MEDIA_TEMPLATE_VERSION}$`));
  const html = renderMediaTop({ drops: [], now: NOW });
  assert.match(html, new RegExp(`owned-media\\.css\\?v=${MEDIA_TEMPLATE_VERSION}"`), 'CSS を上げたら保存の版も上げる');
});

// 2026-10-14 大隆さん「Instagramやxに貼りたいからURL」: 貼る URL の印（utm）を来訪元として残す。
test('記事・買い物ノートの来訪元は、URL の印（utm_source/utm_medium）を参照元より優先する', () => {
  const source = readFileSync(new URL('../public/seo-article-analytics.mjs', import.meta.url), 'utf8');
  assert.match(source, /const \[landingFrom, landingMedium\] = tagged \|\| landingSource\(document\.referrer\);/);
  assert.match(source, /\/\^\[a-z0-9\]\[a-z0-9_\.-\]\{0,40\}\$\/u\.test\(requestedSource\)/);
});

// 2026-10-14 大隆さん「ページの後半は文章だけになってるじゃん。もっと商品画像や価格履歴をたくさん表示して」
import { loadRankingShelves, priceChange, withShelfHistories } from '../src/owned-media.mjs';
test('ジャンル別の棚: 3日以内の公式ランキング保存から、画像と商品IDのある上位商品だけ。値下がり欄と重ねない', async () => {
  const ranking = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ record_key: `RAKUTEN:k:${i}`, display_name: `フライパン ${i}`, image_url: `https://thumbnail.image.rakuten.co.jp/k${i}.jpg?_ex=128x128`, rank: i + 1, offers: [{ price: 1000 + i, marketplace: 'RAKUTEN_JP' }], ...extra }));
  const env = envWith((db) => {
    db.exec(readFileSync(new URL('../migrations/0045_marketplace_ranking.sql', import.meta.url), 'utf8'));
    const ins = db.prepare(`INSERT INTO marketplace_ranking_cache VALUES ('RAKUTEN_JP', ?, 'REALTIME', ?, '2026-10-14T00:00:00Z', ?)`);
    ins.run('kitchen', JSON.stringify(ranking(6)), '2026-10-14T01:00:00Z');
    ins.run('food', JSON.stringify(ranking(3, { image_url: '' })), '2026-10-14T01:00:00Z');                 // 画像なし → 棚にしない
    ins.run('buzz_unknown', JSON.stringify(ranking(4).map((x) => ({ ...x, record_key: x.record_key + 'u' }))), '2026-10-14T01:00:00Z'); // 登録外のジャンル
    ins.run('interior', JSON.stringify(ranking(4).map((x) => ({ ...x, record_key: x.record_key + 'i' }))), '2026-10-01T00:00:00Z'); // 古い
    observe(db, { id: 'k:1', date: '2026-10-10', price: 1300 }); observe(db, { id: 'k:1', date: '2026-10-13', price: 1001 });
  });
  const shelves = await loadRankingShelves(env, { now: NOW, exclude: ['RAKUTEN:k:0'] });
  assert.deepEqual(shelves.map((s) => s.id), ['kitchen']);
  assert.equal(shelves[0].label, 'キッチン用品・食器・調理器具');
  assert.deepEqual(shelves[0].items.map((i) => i.record_key), ['RAKUTEN:k:1', 'RAKUTEN:k:2', 'RAKUTEN:k:3', 'RAKUTEN:k:4'], '値下がり欄に出た商品は除き、4件まで');
  assert.match(shelves[0].items[0].image_url, /_ex=300x300/);
  const [withHistory] = await withShelfHistories(env, shelves, { now: NOW });
  assert.equal(withHistory.items[0].history.length, 2);
  assert.deepEqual(priceChange(withHistory.items[0].history), { diff: -299, days: 2, from: '2026-10-10', to: '2026-10-13' });
  assert.equal(priceChange([{ date: '2026-10-13', price: 1 }]), null);
  const html = renderMediaTop({ drops: [], shelves: [withHistory], now: NOW });
  assert.match(html, /ジャンル別・いま売れている商品と価格の動き/);
  assert.match(html, /<span class="media-tile-rank">2位<\/span><span class="media-tile-badge media-tile-badge-down">-¥299<\/span>/);
  assert.match(html, /<span class="media-tile-history"><svg class="media-spark"/);
  assert.match(html, /価格の記録はこれから/, '記録が1日だけの商品は線を描かずにそう書く');
  // 商品の棚は記事の一覧より前（後半を文字だけにしない）
  assert.ok(html.indexOf('id="ranking"') < html.indexOf('id="find"'));
});
