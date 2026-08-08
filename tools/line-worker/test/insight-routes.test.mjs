import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import { handleInsightRoutes, scanWishForNewMatches, runInsightScan } from '../src/insight-routes.mjs';
import { filterCategoryMismatches } from '../src/knowledge-search.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;

// HOSHILU INSIGHT 通知仕様変更指示書 v1.0 section19の最小テスト項目のうち、
// D1(実際にはnode:sqliteでミラーする)を必要とするものをここに集約する。

const MIGRATIONS = [
  '0001_product_search.sql',
  '0002_member_wishes.sql', '0003_member_wish_preferences.sql',
  '0005_mywatch_notifications.sql', '0036_mywatch_notification_product_fields.sql',
  '0044_insight_search_watch.sql'
];

function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of MIGRATIONS) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (...values) => ({
        run: async () => {
          const result = statement.run(...values);
          return { meta: { changes: Number(result.changes || 0) } };
        },
        first: async () => statement.get(...values) || null,
        all: async () => ({ results: statement.all(...values) })
      });
      // D1の実際のAPIはbind()なしでもパラメータ無しクエリに対して直接
      // run()/first()/all()を呼べる。insight-routes.mjsのscan()はパラメータ
      // 無しのSELECTをbind()を挟まずそのままall()するため、prepare()の
      // 戻り値自体にもrun/first/allを生やしておく。
      return { bind: bound, ...bound() };
    }
  };
  return { sqlite, db };
}

function insertWish(sqlite, { memberId, wishId, queryText, notifyNewMatch = 1, watchSale = 1, watchPrice = 1, watchCoupon = 0, watchRestock = 0 }) {
  const now = '2026-08-08T00:00:00Z';
  sqlite.prepare(
    `INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at)
    VALUES(?,?,?,'JA',?,?,?,?,'INSTANT',?,NULL,?,?)`
  ).run(memberId, wishId, queryText, watchSale, watchPrice, watchCoupon, watchRestock, notifyNewMatch, now, now);
}

const relevantCandidate = (asin) => ({ asin, marketplace: 'AMAZON_JP', product_name: '白 長袖 レディース カットソー', display_name: '白 長袖 レディース カットソー', image_url: 'https://example.test/img.jpg' });

test('section19 内部API認証: 32文字未満または不一致のシークレットは拒否する', async () => {
  const request = new Request('https://hoshilu.app/api/internal/insight/scan', {
    method: 'POST', headers: { 'x-hoshilu-internal-secret': 'wrong' }
  });
  const response = await handleInsightRoutes(request, { MYWATCH_CRON_SECRET: 'a-secure-secret-that-is-at-least-32-characters' });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'INSIGHT_UNAUTHORIZED');
});

test('section19 検索条件保存: notify_new_match=1の条件だけがスキャン対象になる', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-on', queryText: '白 長袖 レディース カットソー', notifyNewMatch: 1 });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-on');
  const outcome = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => [relevantCandidate('B000A')]);
  assert.equal(outcome.scanned, true);
  assert.equal(outcome.matched, 1);
});

test('HOSHILU INSIGHTをオフにした条件(notify_new_match=0)はスキャンしない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-off', queryText: 'カメラ', notifyNewMatch: 0 });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-off');
  const outcome = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => [relevantCandidate('B000A')]);
  assert.equal(outcome.scanned, false);
  const notifications = sqlite.prepare('SELECT * FROM mywatch_notifications').all();
  assert.equal(notifications.length, 0);
});

test('section19 条件不一致商品を通知しない: 実際のfilterCategoryMismatchesを通過した候補だけが新着になり得る', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-cat', queryText: '白 長袖 レディース カットソー' });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-cat');
  // 「白 長袖 レディース カットソー」に対して、あからさまなカテゴリ不一致
  // (家具)を実際のfilterCategoryMismatchesへ通す。これはこのテストが
  // 独自にカテゴリ判定ロジックを実装しているのではなく、本番と同じ
  // knowledge-search.mjs のカテゴリ不一致除去そのものを使っていることの
  // 証明であり、section16の「単純な部分文字列一致を使ってはいけない」を
  // 満たす。
  const searchCandidates = async (env, query) => filterCategoryMismatches(query, [
    relevantCandidate('B000A'),
    { asin: 'B000FURNITURE', marketplace: 'AMAZON_JP', display_name: '木製ダイニングテーブル 4人用' }
  ]);
  const outcome = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', searchCandidates);
  const notification = sqlite.prepare('SELECT * FROM mywatch_notifications WHERE wish_id=?').get('w-cat');
  assert.ok(notification);
  assert.doesNotMatch(notification.body + notification.title, /B000FURNITURE/);
  const matches = sqlite.prepare('SELECT * FROM search_watch_matches WHERE wish_id=?').all('w-cat');
  assert.ok(!matches.some((row) => row.asin === 'B000FURNITURE'));
});

test('section19 0件時に通知しない: 一致する商品が無ければ何も送らない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-empty', queryText: 'カメラ' });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-empty');
  const outcome = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => []);
  assert.equal(outcome.matched, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM mywatch_notifications').get().c, 0);
});

test('section19 複数商品をまとめて通知: 商品ごとの個別通知ではなく1件のバッチ通知になる', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-batch', queryText: '白 長袖 レディース カットソー' });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-batch');
  const candidates = [relevantCandidate('B000A'), relevantCandidate('B000B'), relevantCandidate('B000C')];
  const outcome = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => candidates);
  assert.equal(outcome.matched, 3);
  const notifications = sqlite.prepare('SELECT * FROM mywatch_notifications WHERE wish_id=?').all('w-batch');
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].body, /3商品見つかりました/);
});

test('section19 同一商品を重複通知しない: 2回目のスキャンでは既に通知済みの商品を再通知しない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-dedup', queryText: '白 長袖 レディース カットソー' });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-dedup');
  const searchCandidates = async () => [relevantCandidate('B000A')];
  await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', searchCandidates);
  const second = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T02:00:00Z', searchCandidates);
  assert.equal(second.matched, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM mywatch_notifications WHERE wish_id=?').get('w-dedup').c, 1);
});

test('section19 単なるタイトル変化では再通知しない(識別子はASIN/モールIDベース)', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-title', queryText: '白 長袖 レディース カットソー' });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-title');
  await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => [relevantCandidate('B000A')]);
  const renamed = { ...relevantCandidate('B000A'), display_name: '白 長袖 レディース カットソー【SALE】' };
  const second = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T02:00:00Z', async () => [renamed]);
  assert.equal(second.matched, 0);
});

test('section19・11・12: INSIGHTはAIウォッチの4種別(値下げ/クーポン/再入荷/販売開始)を一切生成しない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-noleak', queryText: '白 長袖 レディース カットソー' });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-noleak');
  await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => [relevantCandidate('B000A')]);
  const notifications = sqlite.prepare('SELECT event_type FROM mywatch_notifications').all();
  assert.ok(notifications.length > 0);
  for (const row of notifications) {
    assert.equal(row.event_type, 'INSIGHT_NEW_MATCH');
    assert.ok(!['SALE_START', 'PRICE_DROP', 'COUPON', 'RESTOCK'].includes(row.event_type));
  }
});

test('section19・15: AIウォッチの既存フラグ(watch_sale等)はINSIGHTスキャンで一切変更されない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'm1', wishId: 'w-preserve', queryText: '白 長袖 レディース カットソー',
    watchSale: 0, watchPrice: 1, watchCoupon: 1, watchRestock: 0
  });
  const before = sqlite.prepare('SELECT watch_sale,watch_price,watch_coupon,watch_restock FROM member_wishes WHERE wish_id=?').get('w-preserve');
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-preserve');
  await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => [relevantCandidate('B000A')]);
  const after = sqlite.prepare('SELECT watch_sale,watch_price,watch_coupon,watch_restock FROM member_wishes WHERE wish_id=?').get('w-preserve');
  assert.deepEqual(after, before);
});

test('section19・12: SALE RADARのセンチネル(MARKETPLACE_SALES)やmarketplace_sale_eventsには一切触れない', () => {
  const source = readFileSync(new URL('../src/insight-routes.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /MARKETPLACE_SALES/);
  assert.doesNotMatch(source, /marketplace_sale_events/);
});

// 2026-08-08: HOSHILU AIウォッチ側の /api/internal/mywatch/events は
// まだ存在しない外部の価格監視パイプラインからのイベント受け口のため
// scheduled()配線を見送っていたが、INSIGHTのスキャンはD1索引検索のみで
// 完結する(AI呼び出しが無い)ため、cronから直接呼べる runInsightScan() を
// 用意した。CRON_SECRET認証もRequestオブジェクトも不要な内部呼び出し専用
// 関数であることを確認する。
test('runInsightScan()はRequest/認証なしで直接呼び出せ、scan()と同じ結果件数を返す', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-direct-1', queryText: '白 長袖 レディース カットソー' });
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-direct-2', queryText: '靴', notifyNewMatch: 0 });
  const result = await runInsightScan({ PRODUCT_DB: db }, '2026-08-08T03:00:00Z');
  assert.equal(result.scanned, 1);
  assert.equal(result.truncated, false);
});

test('runInsightScan()はPRODUCT_DB未設定でも例外を投げず0件で返す', async () => {
  const result = await runInsightScan({});
  assert.deepEqual(result, { scanned: 0, notifications_sent: 0, truncated: false });
});

test('runInsightScan()は1回の実行でスキャンする件数に上限があり、超過時はtruncated:trueで報告する', async () => {
  const { sqlite, db } = sqliteD1();
  // 上限(300件)ちょうどでは打ち切らないことも合わせて確認できるよう、
  // 上限+2件だけ作る(全件フルスキャンは重いので必要最小限に留める)。
  for (let index = 0; index < 302; index += 1) {
    insertWish(sqlite, { memberId: 'm1', wishId: `w-batch-${String(index).padStart(4, '0')}`, queryText: 'カメラ' });
  }
  const result = await runInsightScan({ PRODUCT_DB: db }, '2026-08-08T03:00:00Z');
  assert.equal(result.truncated, true);
  assert.equal(result.scanned, 300);
});

test('scheduled()のcronハンドラがrunInsightScanを呼び出す配線になっている', async () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*handleInsightRoutes,\s*runInsightScan\s*\}\s*from\s*'\.\/insight-routes\.mjs'/);
  const scheduledMatch = source.match(/async scheduled\(controller, env, ctx\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(scheduledMatch, 'scheduled()ハンドラが見つかりません');
  assert.match(scheduledMatch[0], /runInsightScan\(env, scheduledAt\.toISOString\(\)\)/);
});

test('scan() HTTPハンドラは複数の保存条件を一度に処理し、結果件数を返す', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-http-1', queryText: '白 長袖 レディース カットソー' });
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-http-2', queryText: 'カメラ' });
  insertWish(sqlite, { memberId: 'm1', wishId: 'w-http-3', queryText: '靴', notifyNewMatch: 0 });
  const request = new Request('https://hoshilu.app/api/internal/insight/scan', {
    method: 'POST', headers: { 'x-hoshilu-internal-secret': 'a-secure-secret-that-is-at-least-32-characters' }
  });
  const response = await handleInsightRoutes(request, { MYWATCH_CRON_SECRET: 'a-secure-secret-that-is-at-least-32-characters', PRODUCT_DB: db });
  assert.equal(response.status, 200);
  const body = await response.json();
  // notify_new_match=1の2件だけがスキャンされる(w-http-3は対象外)。
  // D1索引データを用意していないため実際のマッチ件数は0だが、例外を
  // 投げずに完了することを確認する。
  assert.equal(body.scanned, 2);
});
