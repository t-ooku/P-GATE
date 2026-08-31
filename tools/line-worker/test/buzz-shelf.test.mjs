import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUZZ_BUDGET_SHELVES, BUZZ_SHELF_CATEGORY_IDS, BUZZ_SHELF_ITEM_LIMIT, BUZZ_THEME_ROTATIONS,
  buildBudgetShelves, buildGenreShelves, buildKoreanShelf, buildRisingShelf, buzzShelfResult, buzzThemeFor, buzzThemeStateFor, recordBuzzSnapshots
} from '../src/buzz-shelf.mjs';
import { RAKUTEN_RANKING_CATEGORIES } from '../src/marketplace-ranking.mjs';

const worker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { RAKUTEN_APPLICATION_ID: 'test-app-id', RAKUTEN_ACCESS_KEY: 'test-access-key' };

test('BUZZテーマは火曜・金曜JSTに週2回切り替わり韓国軸を含む', () => {
  const tuesday = Date.parse('2026-08-25T00:00:00+09:00');
  const friday = Date.parse('2026-08-28T00:00:00+09:00');
  assert.equal(buzzThemeFor(tuesday).id, BUZZ_THEME_ROTATIONS[0].id);
  assert.equal(buzzThemeFor(friday).id, BUZZ_THEME_ROTATIONS[1].id);
  assert.match(BUZZ_THEME_ROTATIONS[0].label,/韓国/u);
  const updates = [
    '2026-08-25T00:00:00+09:00', '2026-08-28T00:00:00+09:00',
    '2026-09-01T00:00:00+09:00', '2026-09-04T00:00:00+09:00',
    '2026-09-08T00:00:00+09:00', '2026-09-11T00:00:00+09:00'
  ].map((value) => buzzThemeStateFor(Date.parse(value)));
  assert.deepEqual(updates.map((state) => state.theme.id), BUZZ_THEME_ROTATIONS.map((theme) => theme.id));
  assert.equal(new Set(updates.map((state) => state.updated_key)).size, updates.length);
});

test('BUZZは共有流入・共有開始・商品送客を匿名成長計測へ接続する', () => {
  const html = fs.readFileSync(path.join(worker, 'public', 'buzz.html'), 'utf8');
  const client = fs.readFileSync(path.join(worker, 'public', 'buzz.mjs'), 'utf8');
  const homeClient = fs.readFileSync(path.join(worker, 'public', 'buzz-home.mjs'), 'utf8');
  const analytics = fs.readFileSync(path.join(worker, 'public', 'growth-analytics.mjs'), 'utf8');
  assert.match(html, /growth-analytics\.mjs\?v=7/);
  assert.match(html, /buzz\.mjs\?v=4/);
  assert.match(html, /share-button share-discovery-button/);
  assert.match(client, /utm_campaign: 'hoshilu_buzz'/);
  assert.match(client, /utm_content: content/);
  assert.match(client, /shelf-share share-discovery-button/);
  assert.match(client, /card product-primary-link ranking-product-card/);
  assert.match(client, /card\.dataset\.marketplace = text\(marketplace\)/);
  assert.match(homeClient, /card\.dataset\.marketplace = text\(item\.marketplace\)/);
  assert.match(analytics, /price-compare-search-link,\.buzz-home-card/);
  assert.match(analytics, /closest\('\.ranking-product-card,\.buzz-home-card'\)/);
});

// buzz_ranking_snapshots と marketplace_ranking_cache の最小D1スタブ。
function d1Stub({ snapshots = [], maxCapturedAt = null } = {}) {
  const executed = [];
  return {
    executed,
    prepare(sql) {
      const statement = (args = []) => {
        return {
          async first() {
            if (/MAX\(captured_at\)/u.test(sql)) return { captured_at: maxCapturedAt };
            if (/FROM buzz_ranking_snapshots WHERE marketplace_id/u.test(sql)) {
              const [, shelfId, newest, oldest] = args;
              const rows = snapshots.filter((row) => row.shelf_id === shelfId
                && row.captured_at <= newest && row.captured_at >= oldest)
                .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
              return rows[0] || null;
            }
            return null; // marketplace_ranking_cache miss
          },
          async run() { executed.push({ sql, args }); return { success: true }; }
        };
      };
      return { ...statement(), bind: (...args) => statement(args) };
    }
  };
}

function rankingItem(rank, name, price = 1980) {
  return { rank, itemName: name, itemPrice: price, reviewAverage: 4.5, reviewCount: 120,
    itemUrl: `https://item.rakuten.co.jp/shop${rank}/item${rank}/`,
    mediumImageUrls: [{ imageUrl: `https://thumbnail.image.rakuten.co.jp/item${rank}.jpg` }] };
}

// 健全性チェック(商品名とジャンルの一致)を通すため、モックの商品名には
// ジャンルの語彙(登録ラベル)を含め、重複棚ガードのためURLもジャンル別にする。
function genreNoun(genreId) {
  const category = RAKUTEN_RANKING_CATEGORIES.find((entry) => entry.genre_id === genreId);
  return category ? category.label : '商品';
}

function rankingFetcher(overrides = {}) {
  return async (input) => {
    const url = new URL(String(input));
    const genreId = url.searchParams.get('genreId') || '';
    if (overrides[genreId]) return overrides[genreId](url);
    if (url.pathname.includes('/IchibaItem/Ranking/')) {
      return new Response(JSON.stringify({ Items: Array.from({ length: 10 }, (_, i) => ({
        ...rankingItem(i + 1, `${genreNoun(genreId)} ${genreId}-${i + 1}`),
        itemUrl: `https://item.rakuten.co.jp/shop${genreId}/item${i + 1}/`
      })) }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
}

test('BUZZ棚は定義順の小ジャンルを公式ランキングだけで返す', async () => {
  const now = Date.parse('2026-08-25T00:00:00+09:00');
  const result = await buzzShelfResult(env, rankingFetcher(), now);
  // 履歴なし(急上昇なし)の構成: ジャンル棚(定義順) + 予算別棚。
  assert.deepEqual(
    result.shelves.map((shelf) => shelf.shelf_id),
    ['korean_beauty', ...buzzThemeFor(now).category_ids, ...BUZZ_BUDGET_SHELVES.map((budget) => budget.shelf_id)]
  );
  assert.equal(result.shelf_count, result.shelves.length);
  // v3.1 §13: ジャンル棚は「◯◯で探す」用の安全な検索語(検証済み小ジャンル名)を持つ。
  for (const shelf of result.shelves.filter((entry) => !['derived_from_official', 'official_data_unavailable'].includes(entry.ranking_mode))) {
    assert.equal(shelf.search_keyword, shelf.label);
  }
  for (const shelf of result.shelves.filter((entry) => !['derived_from_official', 'official_data_unavailable'].includes(entry.ranking_mode))) {
    assert.equal(shelf.source, 'RAKUTEN_OFFICIAL_RANKING_API');
    assert.equal(shelf.marketplace, 'RAKUTEN_JP');
    assert.equal(shelf.headline, 'いま売れてる。');
    assert.match(shelf.ranking_type, /リアルタイムランキング/u);
    assert.ok(shelf.items.length > 0 && shelf.items.length <= BUZZ_SHELF_ITEM_LIMIT);
    for (const item of shelf.items) {
      assert.ok(item.name);
      assert.match(item.product_url, /^https:\/\/item\.rakuten\.co\.jp\//u);
      assert.equal(item.price_confirmed, item.price > 0);
    }
  }
  // 架空のBUZZスコア・SNS指標のフィールドをレスポンスに作らない。
  for (const shelf of result.shelves) {
    const keys = [...Object.keys(shelf), ...shelf.items.flatMap((item) => Object.keys(item))];
    assert.ok(keys.every((key) => !/^(buzz_score|sns_\w+|likes?|views?|share_count|trend_score)$/iu.test(key)), `fabricated metric field: ${keys.join(',')}`);
  }
  assert.match(result.methodology, /モール公式ランキングAPI/u);
  assert.match(result.disclaimer, /変動します/u);
});

test('各ランキング棚はAPIの配列順に依存せず公式順位の昇順で表示する', async () => {
  const fetcher = async (input) => {
    const url = new URL(String(input));
    const genreId = url.searchParams.get('genreId') || '';
    if (!url.pathname.includes('/IchibaItem/Ranking/')) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ Items: [7, 9, 4, 2, 1].map((rank) => ({
      ...rankingItem(rank, `${genreNoun(genreId)} ${genreId}-${rank}`),
      itemUrl: `https://item.rakuten.co.jp/shop${genreId}/item${rank}/`
    })) }), { status: 200 });
  };
  const shelves = await buildGenreShelves(env, fetcher);
  assert.ok(shelves.length > 0);
  for (const shelf of shelves) {
    assert.deepEqual(shelf.items.map((item) => item.rank), [1, 2, 4, 7, 9]);
  }
});

test('公開する各棚は元の公式順位を残してHOSHILU BUZZ順位を1位から振り直す', async () => {
  const result = await buzzShelfResult(env, rankingFetcher());
  for (const shelf of result.shelves) {
    assert.deepEqual(shelf.items.map((item) => item.rank),
      shelf.items.map((_, index) => index + 1));
    assert.ok(shelf.items.every((item) => Number(item.source_rank) >= 1));
  }
  assert.match(result.methodology, /各棚の掲載順を1位から表示/u);
});

test('リアルタイムが404の小ジャンルは口コミ件数順ラベルへ縮退する', async () => {
  const target = RAKUTEN_RANKING_CATEGORIES.find((entry) => entry.id === BUZZ_SHELF_CATEGORY_IDS[0]);
  const fetcher = rankingFetcher({
    [target.genre_id]: (url) => url.pathname.includes('/IchibaItem/Ranking/')
      ? new Response('not found', { status: 404 })
      : new Response(JSON.stringify({ Items: [rankingItem(1, `${target.label} 口コミ商品`)] }), { status: 200 })
  });
  const result = await buzzShelfResult(env, fetcher);
  const degraded = result.shelves.find((shelf) => shelf.shelf_id === target.id);
  assert.ok(degraded);
  assert.equal(degraded.headline, '口コミが多い。');
  assert.match(degraded.ranking_type, /口コミ件数順/u);
});

test('公式データ全滅時も商品や順位を作らず韓国コスメの検索入口だけは残す', async () => {
  const result = await buzzShelfResult({}, rankingFetcher());
  assert.equal(result.shelf_count, 1);
  assert.equal(result.shelves[0].shelf_id, 'korean_beauty');
  assert.equal(result.shelves[0].ranking_mode, 'official_data_unavailable');
  assert.deepEqual(result.shelves[0].items, []);
  assert.equal(result.shelves[0].search_keyword, '韓国コスメ');
});

test('予算別棚は取得済み公式ランキングの実価格だけで作り、重複URLを混ぜない', async () => {
  // 価格を順位に応じて変え、3,000円以下棚の絞り込みを確かめる。
  const fetcher = async (input) => {
    const url = new URL(String(input));
    const genreId = url.searchParams.get('genreId') || 'g';
    if (url.pathname.includes('/IchibaItem/Ranking/')) {
      return new Response(JSON.stringify({ Items: Array.from({ length: 8 }, (_, i) => ({
        rank: i + 1, itemName: `${genreNoun(genreId)} ${genreId}-${i + 1}`, itemPrice: (i + 1) * 900,
        reviewAverage: 4, reviewCount: 10,
        itemUrl: `https://item.rakuten.co.jp/shop-${genreId}/item${i + 1}/`,
        mediumImageUrls: [{ imageUrl: `https://thumbnail.image.rakuten.co.jp/${genreId}-${i + 1}.jpg` }]
      })) }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  const genreShelves = await buildGenreShelves(env, fetcher);
  const budgets = buildBudgetShelves(genreShelves);
  assert.equal(budgets.length, BUZZ_BUDGET_SHELVES.length);
  const under3000 = budgets.find((shelf) => shelf.shelf_id === 'budget_3000');
  assert.ok(under3000.items.length > 0);
  const seen = new Set();
  for (const item of under3000.items) {
    assert.ok(item.price > 0 && item.price <= 3000, `price out of budget: ${item.price}`);
    assert.equal(item.price_confirmed, true);
    assert.match(item.context_label, /位$/u);
    assert.ok(!seen.has(item.product_url), 'duplicate product_url');
    seen.add(item.product_url);
  }
  assert.match(under3000.ranking_type, /公式ランキング/u);
});

test('急上昇棚は実測の順位変化だけから作られ、履歴が無ければ出ない', async () => {
  const genreShelves = await buildGenreShelves(env, rankingFetcher());
  const now = Date.parse('2026-08-19T12:00:00Z');
  // 履歴なし → 棚なし
  assert.equal(await buildRisingShelf({ ...env, PRODUCT_DB: d1Stub() }, genreShelves, now), null);
  // 24時間前のスナップショット: 現1位商品が以前は7位、現2位商品は圏外。
  const target = genreShelves[0];
  const snapshot = {
    shelf_id: target.shelf_id,
    captured_at: '2026-08-18T12:00:00Z',
    payload_json: JSON.stringify([
      { rank: 7, name: '旧7位', product_url: target.all_items[0].product_url },
      ...target.all_items.slice(2).map((item) => ({ rank: item.rank, name: item.name, product_url: item.product_url }))
    ])
  };
  const shelf = await buildRisingShelf({ ...env, PRODUCT_DB: d1Stub({ snapshots: [snapshot] }) }, genreShelves, now);
  assert.ok(shelf);
  assert.equal(shelf.shelf_id, 'rising');
  assert.match(shelf.ranking_type, /実測/u);
  const first = shelf.items.find((item) => item.product_url === target.all_items[0].product_url);
  assert.ok(first);
  assert.match(first.movement, /^7位→1位\(24時間\)$/u);
  const entrant = shelf.items.find((item) => item.product_url === target.all_items[1].product_url);
  assert.ok(entrant);
  assert.match(entrant.movement, /^圏外→2位\(24時間\)$/u);
});

test('スナップショット記録はテーブル未適用なら静かにスキップし、6時間以内は再記録しない', async () => {
  // PRODUCT_DBなし
  assert.deepEqual(await recordBuzzSnapshots({}, rankingFetcher()), { recorded: 0, skipped: 'NO_DB' });
  // 直近記録が新しい → スキップ
  const now = Date.parse('2026-08-19T12:00:00Z');
  const fresh = d1Stub({ maxCapturedAt: '2026-08-19T10:00:00Z' });
  assert.deepEqual(await recordBuzzSnapshots({ ...env, PRODUCT_DB: fresh }, rankingFetcher(), now), { recorded: 0, skipped: 'FRESH' });
  assert.equal(fresh.executed.length, 0);
  // 記録可能 → 棚数ぶんINSERT + prune DELETE
  const stale = d1Stub({ maxCapturedAt: '2026-08-19T02:00:00Z' });
  const outcome = await recordBuzzSnapshots({ ...env, PRODUCT_DB: stale }, rankingFetcher(), now);
  assert.equal(outcome.recorded, buzzThemeFor(now).category_ids.length);
  const inserts = stale.executed.filter((entry) => /INSERT OR IGNORE INTO buzz_ranking_snapshots/u.test(entry.sql));
  assert.equal(inserts.length, buzzThemeFor(now).category_ids.length);
  assert.equal(stale.executed.filter((entry) => /DELETE FROM buzz_ranking_snapshots/u.test(entry.sql)).length, 1);
  // 公開レスポンスへ内部フィールドall_itemsを漏らさない。
  const result = await buzzShelfResult(env, rankingFetcher());
  for (const shelf of result.shelves) assert.equal('all_items' in shelf, false);
});

test('cronがスナップショット記録を呼び、migration 0057が用意されている', () => {
  const source = fs.readFileSync(path.join(worker, 'src', 'index.mjs'), 'utf8');
  const scheduled = source.slice(source.indexOf('async scheduled('));
  assert.match(scheduled, /recordBuzzSnapshots\(env, fetch, scheduledAt\.getTime\(\)\)/u);
  const migration = fs.readFileSync(path.join(worker, 'migrations', '0057_buzz_ranking_snapshots.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS buzz_ranking_snapshots/u);
  assert.match(migration, /PRIMARY KEY \(marketplace_id, shelf_id, captured_at\)/u);
});

test('workerは/api/buzz/shelfをGET・5分キャッシュで公開する', () => {
  const source = fs.readFileSync(path.join(worker, 'src', 'index.mjs'), 'utf8');
  assert.match(source, /url\.pathname === '\/api\/buzz\/shelf'/u);
  const route = source.slice(source.indexOf("'/api/buzz/shelf'"));
  assert.match(route.slice(0, 2000), /max-age=300/u);
  assert.match(source, /import \{ buzzShelfResult, recordBuzzSnapshots \} from '\.\/buzz-shelf\.mjs';/u);
  // v3.1 §11-14/§33: 「◯◯で探す」検索フォールバックは署名付き/goリンクで付与し、
  // リンク生成失敗でも棚表示を止めない。
  assert.match(route.slice(0, 2000), /signedMarketplaceSearchLinks\(shelf\.search_keyword, buzzLinkContext\)\.catch\(\(\) => \[\]\)/u);
});

test('ホームのBUZZ棚は検索直下の一等地にあり、/buzzへの導線を持つ', () => {
  const html = fs.readFileSync(path.join(worker, 'public', 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(worker, 'public', 'buzz-home.mjs'), 'utf8');
  assert.match(html, /<section id="buzzHome" class="buzz-home"/u);
  assert.match(html, /<a class="buzz-home-more" href="\/buzz">/u);
  assert.doesNotMatch(html, /※順位はモール公式ランキングがもと。/u);
  assert.match(html, /<link rel="stylesheet" href="\/buzz-home\.css\?v=\d+">/u);
  assert.match(html, /<script type="module" src="\/buzz-home\.mjs\?v=2"><\/script>/u);
  // 配置: MATCHES(結果)の後、SALE RADARの前。
  const buzz = html.indexOf('<p class="step">HOSHILU BUZZ');
  assert.ok(buzz > html.indexOf('<p class="step">MATCHES'));
  assert.ok(buzz < html.indexOf('<p class="step">HOSHILU SALE RADAR'));
  // 実データのみ表示。取得失敗時は枠ごと隠す(空箱・創作値を出さない)。
  assert.match(script, /fetch\('\/api\/buzz\/shelf'/u);
  assert.match(script, /classList\.add\('hidden'\)/u);
  assert.doesNotMatch(script, /Math\.random/u);
  assert.doesNotMatch(script, /購入/u);
});

test('/buzzページは出典と注意書きを持ち、断定表現を使わない', () => {
  const html = fs.readFileSync(path.join(worker, 'public', 'buzz.html'), 'utf8');
  const css = fs.readFileSync(path.join(worker, 'public', 'buzz.css'), 'utf8');
  const script = fs.readFileSync(path.join(worker, 'public', 'buzz.mjs'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(worker, 'public', 'service-worker.js'), 'utf8');
  assert.match(html, /HOSHILU BUZZ/u);
  // 2026-08-19 大隆さん指示: 棚ごとの出典表記は出さない。根拠はページ最下部の
  // 注記1箇所に集約する(JS無効時も静的に表示される)。
  assert.match(html, /順位はモール公式ランキングが根拠です。/u);
  assert.doesNotMatch(html, /出典:/u);
  // 本番CSP(style-src 'self')で拒否されない外部CSSに、ホシルの3色とランキング表現を置く。
  assert.match(html, /<link rel="stylesheet" href="\/buzz\.css\?v=\d+">/u);
  assert.doesNotMatch(html, /<style>/u);
  assert.match(css, /--violet:#7357ff;--pink:#ff4f9a;--cyan:#23b8ff/u);
  assert.match(css, /\.rank\.rank-1/u);
  assert.match(css, /\.rank\.rank-2/u);
  assert.match(css, /\.rank\.rank-3/u);
  assert.match(script, /rankNumber >= 1 && rankNumber <= 3/u);
  assert.match(serviceWorker, /SHELL\.push\('\/buzz\.html', '\/buzz\.css', '\/buzz\.mjs', '\/buzz-home\.css', '\/buzz-home\.mjs'\)/u);
  assert.match(html, /class="topbar"/u);
  assert.match(html, /class="brand"/u);
  assert.match(html, /欲しいを、ちゃんと見つける。/u);
  assert.match(html, /<link rel="canonical" href="https:\/\/hoshilu\.app\/buzz">/u);
  assert.match(html, /<script type="module" src="\/buzz\.mjs\?v=\d+">/u);
  assert.doesNotMatch(html, /No\.?1|Z世代/u);
  // 低価格棚から13モール比較へ進めるが、比較前に最安と断定しない。
  assert.match(html, /class="buzz-compare"/u);
  assert.match(html, /13モール比較/u);
  assert.match(html, /最安候補を確認/u);
  assert.match(html, /値下がり通知/u);
  assert.match(html, /価格・送料・在庫を比べ/u);
  assert.doesNotMatch(html, /(?:必ず|絶対|確実に)最安|最安です/u);
  assert.match(script, /fetch\('\/api\/buzz\/shelf'/u);
  assert.match(script, /rel = 'noopener sponsored'/u);
  assert.doesNotMatch(script, /出典:/u);
  // §22/§24: 棚単位のシェア(実データの商品名のみでシェア文を作る)。
  assert.match(script, /shelfShareText/u);
  assert.match(script, /友達に送る/u);
  // v3.1 §14: 検索フォールバックはサーバーが返した「◯◯で探す」ラベルをそのまま
  // 表示し、「購入」「見る」へ書き換えない。
  assert.match(script, /shelf\.search_links/u);
  assert.doesNotMatch(script, /購入/u);
  // クライアント側で順位・価格・レビューを創作しない(サーバー値の表示のみ)。
  assert.doesNotMatch(script, /Math\.random/u);
});


// 2026-08-19 大隆さん指示: 韓流に繋がる棚を必ず1つ置く。
test('韓国コスメ棚はYahoo!公式ランキングだけを根拠に上位へ入る', async () => {
  const envWithYahoo = { ...env, YAHOO_SHOPPING_CLIENT_ID: 'test-yahoo-client' };
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('highRatingTrendRanking')) {
      return new Response(JSON.stringify({ high_rating_trend_ranking: { ranking_data: [
        { rank: 1, item_information: { name: '韓国コスメ商品A', url: 'https://store.shopping.yahoo.co.jp/shopa/itema.html', regular_price: 1500 },
          review: { rate: 4.6, count: 200, url: 'https://shopping.yahoo.co.jp/review/a' },
          image: { medium: 'https://item-shopping.c.yimg.jp/a.jpg' } },
        { rank: 2, item_information: { name: '韓国コスメ商品B', url: 'https://store.shopping.yahoo.co.jp/shopb/itemb.html', regular_price: 2400 },
          review: { rate: 4.4, count: 90, url: 'https://shopping.yahoo.co.jp/review/b' },
          image: { medium: 'https://item-shopping.c.yimg.jp/b.jpg' } }
      ] } }), { status: 200 });
    }
    if (url.pathname.includes('/IchibaItem/Ranking/')) {
      const genreId = url.searchParams.get('genreId') || '';
      return new Response(JSON.stringify({ Items: Array.from({ length: 6 }, (_, i) => ({
        ...rankingItem(i + 1, `${genreNoun(genreId)} ${i + 1}`),
        itemUrl: `https://item.rakuten.co.jp/shop${genreId}/item${i + 1}/`
      })) }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  const korean = await buildKoreanShelf(envWithYahoo, fetcher);
  assert.ok(korean);
  assert.equal(korean.shelf_id, 'korean_beauty');
  assert.equal(korean.emoji, '❤️');
  assert.equal(korean.marketplace, 'YAHOO_JP');
  assert.match(korean.ranking_type, /高評価トレンドランキング/u);
  assert.equal(korean.search_keyword, '韓国コスメ');
  assert.ok(korean.items.length >= 2);
  const result = await buzzShelfResult(envWithYahoo, fetcher);
  const ids = result.shelves.map((shelf) => shelf.shelf_id);
  assert.ok(ids.indexOf('korean_beauty') !== -1);
  assert.ok(ids.indexOf('korean_beauty') < ids.indexOf(BUZZ_SHELF_CATEGORY_IDS[0]));
  assert.equal(await buildKoreanShelf(env, fetcher), null);
});

test('韓国コスメ棚はトレンドAPI障害時に口コミ件数順ラベルへ縮退する', async () => {
  const envWithYahoo = { ...env, YAHOO_SHOPPING_CLIENT_ID: 'test-yahoo-client' };
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('highRatingTrendRanking')) return new Response('down', { status: 503 });
    if (url.pathname.includes('itemSearch')) {
      return new Response(JSON.stringify({ totalResultsAvailable: 1, hits: [
        { name: '韓国コスメ商品C', url: 'https://store.shopping.yahoo.co.jp/shopc/itemc.html', price: 1800,
          review: { rate: 4.2, count: 40 }, exImage: { url: 'https://item-shopping.c.yimg.jp/c.jpg' }, inStock: true }
      ] }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  const korean = await buildKoreanShelf(envWithYahoo, fetcher);
  if (korean) {
    assert.match(korean.ranking_type, /口コミ件数順/u);
    assert.equal(korean.headline, '口コミが多い。');
  } else {
    assert.equal(korean, null);
  }
});

test('韓国コスメ棚は検索語を無視した米ランキングを除外し、口コミ件数順へ縮退する', async () => {
  const envWithYahoo = { ...env, YAHOO_SHOPPING_CLIENT_ID: 'test-yahoo-client' };
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('highRatingTrendRanking')) {
      return Response.json({ high_rating_trend_ranking: { ranking_data: [
        { rank: 1, item_information: { name: '令和7年産 コシヒカリ 白米 10kg', url: 'https://store.shopping.yahoo.co.jp/rice/a.html', regular_price: 5999 } },
        { rank: 2, item_information: { name: 'ひとめぼれ 白米 5kg', url: 'https://store.shopping.yahoo.co.jp/rice/b.html', regular_price: 3299 } },
        { rank: 3, item_information: { name: '韓国コスメ ファンデーション', url: 'https://store.shopping.yahoo.co.jp/beauty/c.html', regular_price: 1800 } }
      ] } });
    }
    if (url.pathname.includes('itemSearch')) {
      return Response.json({ totalResultsAvailable: 2, hits: [
        { name: 'TIRTIR 韓国コスメ クッションファンデ', url: 'https://store.shopping.yahoo.co.jp/beauty/tirtir.html', price: 2970, review: { rate: 4.5, count: 300 } },
        { name: 'rom&nd ロムアンド リップティント', url: 'https://store.shopping.yahoo.co.jp/beauty/romand.html', price: 1320, review: { rate: 4.4, count: 210 } }
      ] });
    }
    return new Response('not found', { status: 404 });
  };
  const korean = await buildKoreanShelf(envWithYahoo, fetcher);
  assert.ok(korean);
  assert.equal(korean.headline, '口コミが多い。');
  assert.match(korean.ranking_type, /口コミ件数順/u);
  assert.ok(korean.items.every((item) => !/米|コシヒカリ|ひとめぼれ/u.test(item.name)));
  assert.ok(korean.items.every((item) => /韓国|TIRTIR|rom&nd|ロムアンド/iu.test(item.name)));
});

test('韓国コスメ棚は公式APIと縮退検索がともにカテゴリ不一致なら表示しない', async () => {
  const envWithYahoo = { ...env, YAHOO_SHOPPING_CLIENT_ID: 'test-yahoo-client' };
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('highRatingTrendRanking')) {
      return Response.json({ high_rating_trend_ranking: { ranking_data: [
        { rank: 1, item_information: { name: 'コシヒカリ 白米 10kg', url: 'https://store.shopping.yahoo.co.jp/rice/a.html', regular_price: 5999 } }
      ] } });
    }
    if (url.pathname.includes('itemSearch')) {
      return Response.json({ totalResultsAvailable: 1, hits: [
        { name: 'ひとめぼれ 白米 5kg', url: 'https://store.shopping.yahoo.co.jp/rice/b.html', price: 3299 }
      ] });
    }
    return new Response('not found', { status: 404 });
  };
  assert.equal(await buildKoreanShelf(envWithYahoo, fetcher), null);
});

test('口コミ順も不一致なら公式ランキング内の個別確認済み韓国コスメだけを元順位で残す', async () => {
  const envWithYahoo = { ...env, YAHOO_SHOPPING_CLIENT_ID: 'test-yahoo-client' };
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('highRatingTrendRanking')) {
      return Response.json({ high_rating_trend_ranking: { ranking_data: [
        { rank: 1, item_information: { name: 'コシヒカリ 白米 10kg', url: 'https://store.shopping.yahoo.co.jp/rice/a.html', regular_price: 5999 } },
        { rank: 4, item_information: { name: '韓国コスメ ファンデーション', url: 'https://store.shopping.yahoo.co.jp/beauty/foundation.html', regular_price: 1800 } },
        { rank: 6, item_information: { name: 'rom&nd ロムアンド リップティント', url: 'https://store.shopping.yahoo.co.jp/beauty/romand.html', regular_price: 1320 } }
      ] } });
    }
    if (url.pathname.includes('itemSearch')) {
      return Response.json({ totalResultsAvailable: 1, hits: [
        { name: 'ひとめぼれ 白米 5kg', url: 'https://store.shopping.yahoo.co.jp/rice/b.html', price: 3299 }
      ] });
    }
    return new Response('not found', { status: 404 });
  };
  const korean = await buildKoreanShelf(envWithYahoo, fetcher);
  assert.ok(korean);
  assert.equal(korean.headline, '高評価トレンド。');
  assert.deepEqual(korean.items.map((item) => item.rank), [4, 6]);
  assert.ok(korean.items.every((item) => !/米|コシヒカリ|ひとめぼれ/u.test(item.name)));
});

// 2026-08-19 大隆さん報告の再発防止: レディーススニーカー棚にイヤホンが並んだ。
test('ジャンルと合わない棚は口コミ件数順で作り直し、それでも合わなければ出さない', async () => {
  const sneakers = RAKUTEN_RANKING_CATEGORIES.find((entry) => entry.id === 'womens_sneakers');
  const fetcher = async (input) => {
    const url = new URL(String(input));
    const genreId = url.searchParams.get('genreId') || '';
    if (url.pathname.includes('/IchibaItem/Ranking/')) {
      const wrong = genreId === sneakers.genre_id;
      return new Response(JSON.stringify({ Items: Array.from({ length: 6 }, (_, i) => ({
        ...rankingItem(i + 1, wrong ? `ワイヤレスイヤホン Bluetooth ${i + 1}` : `${genreNoun(genreId)} ${i + 1}`),
        itemUrl: `https://item.rakuten.co.jp/shop${genreId}${wrong ? 'w' : ''}/item${i + 1}/`
      })) }), { status: 200 });
    }
    if (url.pathname.includes('/IchibaItem/Search/')) {
      return new Response(JSON.stringify({ Items: Array.from({ length: 6 }, (_, i) => ({
        ...rankingItem(i + 1, `厚底スニーカー レディース ${i + 1}`),
        itemUrl: `https://item.rakuten.co.jp/review${genreId}/item${i + 1}/`
      })) }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  const themeNow = Date.parse('2026-08-25T00:00:00+09:00');
  const shelves = await buildGenreShelves(env, fetcher, themeNow);
  const shelf = shelves.find((entry) => entry.shelf_id === 'womens_sneakers');
  assert.ok(shelf, 'sneakers shelf should be rebuilt from the review ranking');
  assert.equal(shelf.headline, '口コミが多い。');
  assert.ok(shelf.items.every((item) => /スニーカー/u.test(item.name)));
  const brokenFetcher = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/IchibaItem/')) {
      return new Response(JSON.stringify({ Items: Array.from({ length: 6 }, (_, i) => rankingItem(i + 1, `ワイヤレスイヤホン ${i + 1}`)) }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  const broken = await buildGenreShelves(env, brokenFetcher, themeNow);
  assert.equal(broken.find((entry) => entry.shelf_id === 'womens_sneakers'), undefined);
});

test('中身が過半重複する棚は2つ並べない', async () => {
  const nounFor = { wireless_earphones: 'ワイヤレスイヤホン', face_lotion: '化粧水', handheld_fan: 'ハンディファン', mobile_battery: 'モバイルバッテリー', womens_sneakers: 'スニーカー' };
  const fetcher = async (input) => {
    const url = new URL(String(input));
    const genreId = url.searchParams.get('genreId') || '';
    const category = RAKUTEN_RANKING_CATEGORIES.find((entry) => entry.genre_id === genreId);
    if (url.pathname.includes('/IchibaItem/Ranking/')) {
      return new Response(JSON.stringify({ Items: Array.from({ length: 6 }, (_, i) => ({
        ...rankingItem(i + 1, `${nounFor[category?.id] || '商品'} ${i + 1}`),
        itemUrl: `https://item.rakuten.co.jp/shared/item${i + 1}/`
      })) }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  const result = await buzzShelfResult(env, fetcher);
  const genreShelfIds = result.shelves.map((shelf) => shelf.shelf_id)
    .filter((id) => BUZZ_SHELF_CATEGORY_IDS.includes(id));
  assert.equal(genreShelfIds.length, 1, `duplicated shelves should collapse to one, got ${genreShelfIds.join(',')}`);
});

test('急上昇と商品がちょうど半数重複するジャンル棚は並べない', async () => {
  const now = Date.parse('2026-08-29T12:00:00Z');
  const genreShelves = await buildGenreShelves(env, rankingFetcher(), now);
  const target = genreShelves.find((shelf) => shelf.shelf_id === 'wireless_earphones');
  assert.ok(target);
  assert.equal(target.items.length, 6);
  const capturedAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const snapshot = {
    shelf_id: target.shelf_id,
    captured_at: capturedAt,
    payload_json: JSON.stringify(target.all_items.map((item, index) => ({
      rank: index < 3 ? item.rank + 3 : item.rank,
      name: item.name,
      product_url: item.product_url
    })))
  };
  const result = await buzzShelfResult({ ...env, PRODUCT_DB: d1Stub({ snapshots: [snapshot] }) }, rankingFetcher(), now);
  const rising = result.shelves.find((shelf) => shelf.shelf_id === 'rising');
  assert.ok(rising);
  assert.equal(rising.items.length, 3);
  const targetUrls = new Set(target.items.map((item) => item.product_url));
  assert.equal(rising.items.filter((item) => targetUrls.has(item.product_url)).length, 3);
  assert.deepEqual(rising.items.map((item) => item.source_rank), [1, 2, 3]);
  assert.ok(rising.items.every((item) => /^\d+位→\d+位\(24時間\)$/u.test(item.movement)));
  assert.equal(result.shelves.some((shelf) => shelf.shelf_id === target.shelf_id), false);
});

test('急上昇との商品重複が半数未満ならジャンル棚を残す', async () => {
  const now = Date.parse('2026-08-29T12:00:00Z');
  const genreShelves = await buildGenreShelves(env, rankingFetcher(), now);
  const target = genreShelves.find((shelf) => shelf.shelf_id === 'wireless_earphones');
  assert.ok(target);
  assert.equal(target.items.length, 6);
  const capturedAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const snapshot = {
    shelf_id: target.shelf_id,
    captured_at: capturedAt,
    payload_json: JSON.stringify(target.all_items.map((item, index) => ({
      rank: index < 2 ? item.rank + 3 : item.rank,
      name: item.name,
      product_url: item.product_url
    })))
  };
  const result = await buzzShelfResult({ ...env, PRODUCT_DB: d1Stub({ snapshots: [snapshot] }) }, rankingFetcher(), now);
  const rising = result.shelves.find((shelf) => shelf.shelf_id === 'rising');
  assert.ok(rising);
  const targetUrls = new Set(target.items.map((item) => item.product_url));
  assert.equal(rising.items.filter((item) => targetUrls.has(item.product_url)).length, 2);
  assert.ok(result.shelves.some((shelf) => shelf.shelf_id === target.shelf_id));
});
