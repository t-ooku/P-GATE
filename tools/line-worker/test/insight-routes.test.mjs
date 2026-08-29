import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import { handleInsightRoutes, scanWishForNewMatches, runInsightScan } from '../src/insight-routes.mjs';
import { filterCategoryMismatches } from '../src/knowledge-search.mjs';
import {
  deliverDueMemberNotifications, storeMemberNotificationDestination
} from '../src/member-notification-delivery.mjs';
import { deliverDueWebNotifications } from '../src/mywatch-routes.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;

// HOSHILU INSIGHT 通知仕様変更指示書 v1.0 section19の最小テスト項目のうち、
// D1(実際にはnode:sqliteでミラーする)を必要とするものをここに集約する。

const MIGRATIONS = [
  '0001_product_search.sql',
  '0002_member_wishes.sql', '0003_member_wish_preferences.sql',
  '0005_mywatch_notifications.sql', '0031_member_notification_destinations.sql',
  '0036_mywatch_notification_product_fields.sql',
  '0044_insight_search_watch.sql', '0063_insight_scan_index.sql',
  '0064_mywatch_notification_result_url.sql',
  '0065_member_wish_insight_explicit_opt_in.sql',
  '0066_insight_scan_leases.sql'
];

function sqliteD1({ resultUrlColumn = true, explicitOptInColumn = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  let executions = 0;
  for (const name of MIGRATIONS.filter((migration) => (resultUrlColumn
    || migration !== '0064_mywatch_notification_result_url.sql') && (explicitOptInColumn
    || migration !== '0065_member_wish_insight_explicit_opt_in.sql'))) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (...values) => ({
            run: async () => {
              executions += 1;
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes || 0) } };
            },
            first: async () => { executions += 1; return statement.get(...values) || null; },
            all: async () => { executions += 1; return { results: statement.all(...values) }; }
      });
      // D1の実際のAPIはbind()なしでもパラメータ無しクエリに対して直接
      // run()/first()/all()を呼べる。insight-routes.mjsのscan()はパラメータ
      // 無しのSELECTをbind()を挟まずそのままall()するため、prepare()の
      // 戻り値自体にもrun/first/allを生やしておく。
      return { bind: bound, ...bound() };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
  return { sqlite, db, metrics: { get executions() { return executions; } } };
}

function insertWish(sqlite, { memberId, wishId, queryText, notifyNewMatch = 1, watchSale = 1, watchPrice = 1, watchCoupon = 0, watchRestock = 0, watchFrequency = 'INSTANT', baselined = true, insightEnabledAt = undefined }) {
  const now = '2026-08-08T00:00:00Z';
  const enabledAt = insightEnabledAt === undefined && notifyNewMatch === 1 && watchFrequency !== 'MUTED'
    ? now : (insightEnabledAt || null);
  sqlite.prepare(
    `INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at,insight_enabled_at)
    VALUES(?,?,?,'JA',?,?,?,?,?,?,NULL,?,?,?)`
  ).run(memberId, wishId, queryText, watchSale, watchPrice, watchCoupon, watchRestock, watchFrequency, notifyNewMatch, now, now, enabledAt);
  if (baselined) sqlite.prepare(
    `INSERT INTO search_watch_matches
     (member_id,wish_id,product_identity_key,asin,marketplace,matched_at,notification_id)
     VALUES(?,?,?,'','',?,NULL)`
  ).run(memberId, wishId, 'INSIGHT_BASELINE', now);
}

const relevantCandidate = (asin) => ({ asin, marketplace: 'AMAZON_JP', product_name: '白 長袖 レディース カットソー', display_name: '白 長袖 レディース カットソー', image_url: 'https://example.test/img.jpg' });
const fixedWallClock = (at) => () => new Date(at);

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

test('初回scanは現存候補をbaselineへ一括記録し、新着として通知しない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'm-baseline', wishId: 'w-baseline', queryText: 'カメラ', baselined: false
  });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-baseline');
  const candidates = [relevantCandidate('B000A'), relevantCandidate('B000B')];
  const first = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => candidates
  );
  assert.equal(first.matched, 0);
  assert.equal(first.baseline_created, true);
  assert.equal(first.baseline_count, 2);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM mywatch_notifications').get().c, 0);
  assert.deepEqual(sqlite.prepare(
    'SELECT product_identity_key FROM search_watch_matches WHERE wish_id=? ORDER BY product_identity_key'
  ).all('w-baseline').map((row) => row.product_identity_key), [
    'AMAZON_JP:B000A', 'AMAZON_JP:B000B', 'INSIGHT_BASELINE'
  ]);

  const second = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T02:00:00Z',
    async () => [...candidates, relevantCandidate('B000C')]
  );
  assert.equal(second.matched, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM mywatch_notifications').get().c, 1);
});

test('初回候補0件でもbaseline markerを保存し、後日見つかった商品だけ通知する', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'm-empty-baseline', wishId: 'w-empty-baseline', queryText: '希少品', baselined: false
  });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-empty-baseline');
  const first = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T01:00:00Z', async () => []
  );
  assert.equal(first.matched, 0);
  assert.ok(sqlite.prepare(
    "SELECT 1 FROM search_watch_matches WHERE wish_id='w-empty-baseline' AND product_identity_key='INSIGHT_BASELINE'"
  ).get());
  const second = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T02:00:00Z', async () => [relevantCandidate('B000NEW')]
  );
  assert.equal(second.matched, 1);
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
  assert.equal(notifications[0].result_url, '/?search_watch=w-batch#hoshiluSearch');
  assert.doesNotMatch(notifications[0].result_url, /白|長袖|カットソー/u);
});

test('INSIGHT新着はWEBと検証済みLINE・EMAILへ同一event_keyで一度だけ積み、外部配信できる', async () => {
  const { sqlite, db } = sqliteD1();
  const env = {
    PRODUCT_DB: db,
    MEMBER_SESSION_SECRET: 'member-notification-secret'.padEnd(40, 'x'),
    LINE_CHANNEL_ACCESS_TOKEN: 'line-test-token',
    RESEND_API_KEY: 're_test_key',
    MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app'
  };
  insertWish(sqlite, {
    memberId: 'member-external', wishId: 'w-external', queryText: '白 長袖', baselined: true
  });
  await storeMemberNotificationDestination(env, 'member-external', 'LINE', 'U1234567890');
  await storeMemberNotificationDestination(env, 'member-external', 'EMAIL', 'member@example.test');
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-external');
  const now = '2026-08-08T03:00:00.000Z';
  const first = await scanWishForNewMatches(env, wish, now, async () => [relevantCandidate('B000EXT')]);
  assert.equal(first.matched, 1);
  const notifications = sqlite.prepare(
    `SELECT notification_id,event_key,channel,status,body,result_url
     FROM mywatch_notifications WHERE wish_id='w-external' ORDER BY channel`
  ).all();
  assert.deepEqual(notifications.map((row) => [row.channel, row.status]), [
    ['EMAIL', 'PENDING'], ['LINE', 'PENDING'], ['WEB', 'DELIVERED']
  ]);
  assert.equal(new Set(notifications.map((row) => row.event_key)).size, 1);
  assert.ok(notifications.every((row) => row.notification_id.startsWith('insight-')));
  for (const row of notifications.filter((item) => item.channel !== 'WEB')) {
    assert.match(row.body, /https:\/\/hoshilu\.app\/\?search_watch=w-external#hoshiluSearch/);
    assert.doesNotMatch(row.body, /[?&]q=/);
    assert.equal(row.result_url, '/?search_watch=w-external#hoshiluSearch');
  }

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('', { status: 200 });
  };
  try {
    const delivered = await deliverDueMemberNotifications(env, new Date(now), fixedWallClock(now));
    assert.deepEqual(delivered, { delivered: 2, failed: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls.map((call) => new URL(call.url).hostname).sort(), [
    'api.line.me', 'api.resend.com'
  ]);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS c FROM mywatch_notifications WHERE wish_id='w-external' AND status='DELIVERED'"
  ).get().c, 3);

  const duplicate = await scanWishForNewMatches(env, wish, '2026-08-08T04:00:00.000Z',
    async () => [relevantCandidate('B000EXT')]);
  assert.equal(duplicate.matched, 0);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS c FROM mywatch_notifications WHERE wish_id='w-external'"
  ).get().c, 3);
});

test('0064適用前でも旧schema fallbackで通知とmatch台帳を同じbatchへ保存する', async () => {
  const { sqlite, db } = sqliteD1({ resultUrlColumn: false });
  insertWish(sqlite, {
    memberId: 'member-old-schema', wishId: 'w-old-schema', queryText: 'カメラ', baselined: true
  });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-old-schema');
  const result = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T03:00:00.000Z', async () => [relevantCandidate('B000OLD')]
  );
  assert.equal(result.matched, 1);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS c FROM mywatch_notifications WHERE wish_id='w-old-schema'"
  ).get().c, 1);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS c FROM search_watch_matches WHERE wish_id='w-old-schema' AND product_identity_key='AMAZON_JP:B000OLD'"
  ).get().c, 1);
});

test('MUTEDは検索・baseline・通知・match消費をすべて止め、scan batchにも入れない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'member-muted', wishId: 'w-muted', queryText: 'カメラ',
    watchFrequency: 'MUTED', baselined: false
  });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-muted');
  let searched = false;
  const muted = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T03:00:00.000Z', async () => {
    searched = true; return [relevantCandidate('B000MUTE')];
  });
  assert.deepEqual(muted, { scanned: false, matched: 0, muted: true });
  assert.equal(searched, false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM search_watch_matches WHERE wish_id='w-muted'").get().c, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM mywatch_notifications WHERE wish_id='w-muted'").get().c, 0);

  insertWish(sqlite, {
    memberId: 'member-active', wishId: 'w-active', queryText: '靴', watchFrequency: 'INSTANT'
  });
  const scanned = [];
  const batch = await runInsightScan({ PRODUCT_DB: db }, '2026-08-08T03:00:00.000Z', async (_env, row) => {
    scanned.push(row.wish_id); return { scanned: true, matched: 0 };
  });
  assert.equal(batch.scanned, 1);
  assert.deepEqual(scanned, ['w-active']);
});

test('検索中にOFF・MUTED・DELETEされた条件はatomic persist gateで通知もmatchも作らない', async (t) => {
  for (const transition of ['OFF', 'MUTED', 'DELETE']) await t.test(transition, async () => {
    const { sqlite, db } = sqliteD1();
    const suffix = transition.toLowerCase();
    insertWish(sqlite, {
      memberId: `member-search-${suffix}`, wishId: `w-search-${suffix}`,
      queryText: 'camera', baselined: true
    });
    const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?')
      .get(`w-search-${suffix}`);
    let enterSearch;
    let resumeSearch;
    const entered = new Promise((resolve) => { enterSearch = resolve; });
    const resume = new Promise((resolve) => { resumeSearch = resolve; });
    const scan = scanWishForNewMatches(
      { PRODUCT_DB: db }, wish, '2026-08-08T03:00:00.000Z', async () => {
        enterSearch();
        await resume;
        return [relevantCandidate(`B000${transition}`)];
      }
    );
    await entered;
    if (transition === 'OFF') sqlite.prepare(
      'UPDATE member_wishes SET notify_new_match=0,insight_enabled_at=NULL WHERE wish_id=?'
    ).run(wish.wish_id);
    if (transition === 'MUTED') sqlite.prepare(
      "UPDATE member_wishes SET watch_frequency='MUTED',insight_enabled_at=NULL WHERE wish_id=?"
    ).run(wish.wish_id);
    if (transition === 'DELETE') sqlite.prepare(
      'DELETE FROM member_wishes WHERE wish_id=?'
    ).run(wish.wish_id);
    resumeSearch();
    const outcome = await scan;
    assert.equal(outcome.matched, 0);
    assert.equal(sqlite.prepare(
      'SELECT COUNT(*) AS total FROM mywatch_notifications WHERE wish_id=?'
    ).get(wish.wish_id).total, 0);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS total FROM search_watch_matches WHERE wish_id=? AND product_identity_key<>'INSIGHT_BASELINE'"
    ).get(wish.wish_id).total, 0);
  });
});

test('初回検索中に無効化された条件はbaseline markerも候補identityも消費しない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'member-baseline-disabled', wishId: 'w-baseline-disabled',
    queryText: 'camera', baselined: false
  });
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-baseline-disabled');
  const outcome = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T03:00:00.000Z', async () => {
      sqlite.prepare(
        'UPDATE member_wishes SET notify_new_match=0,insight_enabled_at=NULL WHERE wish_id=?'
      ).run(wish.wish_id);
      return [relevantCandidate('B000BASELINEOFF')];
    }
  );
  assert.deepEqual(outcome, {
    scanned: true, matched: 0, baseline_created: false, baseline_count: 0
  });
  assert.equal(sqlite.prepare(
    'SELECT COUNT(*) AS total FROM search_watch_matches WHERE wish_id=?'
  ).get(wish.wish_id).total, 0);
});

test('キュー投入後にOFF/MUTEDとなったINSIGHTはWEB・LINE・EMAILとも配送直前に取消す', async () => {
  const { sqlite, db } = sqliteD1();
  const now = '2026-08-09T00:00:00.000Z';
  insertWish(sqlite, { memberId: 'member-delivery-off', wishId: 'w-delivery-off', queryText: 'camera off' });
  insertWish(sqlite, { memberId: 'member-delivery-muted', wishId: 'w-delivery-muted', queryText: 'camera muted' });
  const insertPending = (memberId, wishId, suffix) => {
    for (const channel of ['WEB', 'LINE', 'EMAIL']) sqlite.prepare(
      `INSERT INTO mywatch_notifications
      (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,created_at,updated_at,result_url)
      VALUES(?,?,?,?,?,?,?,?, 'PENDING',0,?,?,?,?)`
    ).run(`${suffix}-${channel}`, memberId, wishId, `${suffix}-event`, 'INSIGHT_NEW_MATCH', channel,
      'New match', 'Open HOSHILU', now, now, now, `/?search_watch=${wishId}#hoshiluSearch`);
  };
  insertPending('member-delivery-off', 'w-delivery-off', 'off');
  insertPending('member-delivery-muted', 'w-delivery-muted', 'muted');
  sqlite.prepare("UPDATE member_wishes SET notify_new_match=0,insight_enabled_at=NULL WHERE wish_id='w-delivery-off'").run();
  sqlite.prepare("UPDATE member_wishes SET watch_frequency='MUTED',insight_enabled_at=NULL WHERE wish_id='w-delivery-muted'").run();

  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error('must not deliver'); };
  try {
    assert.deepEqual(await deliverDueMemberNotifications(
      { PRODUCT_DB: db }, new Date(now), fixedWallClock(now)
    ), {
      delivered: 0, failed: 0
    });
    assert.deepEqual(await deliverDueWebNotifications(
      { PRODUCT_DB: db }, new Date(now), fixedWallClock(now)
    ), { delivered: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetches, 0);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS total FROM mywatch_notifications WHERE status='CANCELLED'"
  ).get().total, 6);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS total FROM mywatch_delivery_audit WHERE action='CANCEL' AND error_code='INSIGHT_DISABLED'"
  ).get().total, 6);
});

test('専用delivery invocationの実経路はFree上限WEB9・external6と合算48 statements以内', async () => {
  const { sqlite, db, metrics } = sqliteD1();
  const now = '2026-08-09T00:00:00.000Z';
  insertWish(sqlite, { memberId: 'member-delivery-budget', wishId: 'w-delivery-budget', queryText: 'camera' });
  sqlite.prepare("UPDATE member_wishes SET notify_new_match=0,insight_enabled_at=NULL WHERE wish_id='w-delivery-budget'").run();
  const insert = (channel, index) => sqlite.prepare(
    `INSERT INTO mywatch_notifications
    (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,created_at,updated_at,result_url)
    VALUES(?,?,?,?,?,?,?,?,'PENDING',0,?,?,?,?)`
  ).run(`${channel}-${index}`, 'member-delivery-budget', 'w-delivery-budget', `${channel}-event-${index}`,
    'INSIGHT_NEW_MATCH', channel, 'New match', 'Open', now, now, now,
    '/?search_watch=w-delivery-budget#hoshiluSearch');
  for (let index = 0; index < 10; index += 1) insert('WEB', index);
  for (let index = 0; index < 7; index += 1) insert('LINE', index);
  const before = metrics.executions;
  assert.deepEqual(await deliverDueWebNotifications(
    { PRODUCT_DB: db }, new Date(now), fixedWallClock(now)
  ), { delivered: 0 });
  assert.deepEqual(await deliverDueMemberNotifications(
    { PRODUCT_DB: db }, new Date(now), fixedWallClock(now)
  ), {
    delivered: 0, failed: 0
  });
  const used = metrics.executions - before;
  assert.ok(used <= 48, `combined delivery D1 budget exceeded: ${used}`);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM mywatch_notifications WHERE channel='WEB' AND status='CANCELLED'").get().total, 9);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM mywatch_notifications WHERE channel='LINE' AND status='CANCELLED'").get().total, 6);
});

test('中断した外部DELIVERINGは15分後だけlease回収し、fresh claimは奪わない', async () => {
  const { sqlite, db } = sqliteD1();
  const now = '2026-08-09T01:00:00.000Z';
  insertWish(sqlite, { memberId: 'member-stale-delivery', wishId: 'w-stale-delivery', queryText: 'camera' });
  const insertDelivering = (id, updatedAt) => sqlite.prepare(
    `INSERT INTO mywatch_notifications
    (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,created_at,updated_at,result_url)
    VALUES(?,?,?,?,?,'LINE','New','Open','DELIVERING',0,?,?,?,?)`
  ).run(id, 'member-stale-delivery', 'w-stale-delivery', `${id}-event`, 'INSIGHT_NEW_MATCH',
    now, updatedAt, updatedAt, '/?search_watch=w-stale-delivery#hoshiluSearch');
  insertDelivering('stale', '2026-08-09T00:44:59.000Z');
  insertDelivering('fresh', '2026-08-09T00:50:01.000Z');
  assert.deepEqual(await deliverDueMemberNotifications(
    { PRODUCT_DB: db }, new Date('2020-01-01T00:00:00.000Z'), fixedWallClock(now)
  ), {
    delivered: 0, failed: 1
  });
  const rows = sqlite.prepare(
    'SELECT notification_id,status,attempts,next_attempt_at,updated_at FROM mywatch_notifications ORDER BY notification_id'
  ).all();
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    {
      notification_id: 'fresh', status: 'DELIVERING', attempts: 0,
      next_attempt_at: now, updated_at: '2026-08-09T00:50:01.000Z'
    },
    {
      notification_id: 'stale', status: 'PENDING', attempts: 1,
      next_attempt_at: '2026-08-09T02:00:00.000Z', updated_at: now
    }
  ]);
});

test('DAILY・WEEKLYはWEBもnextDeliveryAtまでPENDINGにし、期日前に配信しない', async () => {
  const { sqlite, db } = sqliteD1();
  const now = '2026-08-08T03:00:00.000Z';
  insertWish(sqlite, {
    memberId: 'member-daily', wishId: 'w-daily', queryText: '日次',
    watchFrequency: 'DAILY', baselined: true
  });
  insertWish(sqlite, {
    memberId: 'member-weekly', wishId: 'w-weekly', queryText: '週次',
    watchFrequency: 'WEEKLY', baselined: true
  });
  for (const [wishId, asin] of [['w-daily', 'B000DAY'], ['w-weekly', 'B000WEEK']]) {
    const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get(wishId);
    const outcome = await scanWishForNewMatches({ PRODUCT_DB: db }, wish, now,
      async () => [relevantCandidate(asin)]);
    assert.equal(outcome.matched, 1);
  }
  const daily = sqlite.prepare("SELECT status,next_attempt_at,delivered_at FROM mywatch_notifications WHERE wish_id='w-daily'").get();
  const weekly = sqlite.prepare("SELECT status,next_attempt_at,delivered_at FROM mywatch_notifications WHERE wish_id='w-weekly'").get();
  assert.deepEqual({ ...daily }, {
    status: 'PENDING', next_attempt_at: '2026-08-09T00:00:00.000Z', delivered_at: null
  });
  assert.deepEqual({ ...weekly }, {
    status: 'PENDING', next_attempt_at: '2026-08-15T00:00:00.000Z', delivered_at: null
  });
  assert.deepEqual(await deliverDueWebNotifications(
    { PRODUCT_DB: db }, new Date('2020-01-01T00:00:00.000Z'),
    fixedWallClock('2026-08-08T23:59:59.000Z')
  ), { delivered: 0 });
  assert.deepEqual(await deliverDueWebNotifications(
    { PRODUCT_DB: db }, new Date('2020-01-01T00:00:00.000Z'),
    fixedWallClock('2026-08-09T00:00:00.000Z')
  ), { delivered: 1 });
  assert.equal(sqlite.prepare("SELECT status FROM mywatch_notifications WHERE wish_id='w-weekly'").get().status, 'PENDING');
});

test('同じ新着を並行scanしても決定的IDへ収束し、通知・match台帳を重複しない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'member-race', wishId: 'w-race', queryText: 'カメラ', baselined: true
  });
  sqlite.prepare(
    `INSERT INTO member_notification_destinations
     (member_id,channel,encrypted_destination,verified_at,updated_at)
     VALUES('member-race','EMAIL','encrypted','2026-08-08','2026-08-08')`
  ).run();
  const wish = sqlite.prepare('SELECT * FROM member_wishes WHERE wish_id=?').get('w-race');
  const search = async () => [relevantCandidate('B000RACE')];
  const outcomes = await Promise.all([
    scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T03:00:00.000Z', search),
    scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T03:00:00.000Z', search)
  ]);
  assert.equal(outcomes.reduce((sum, item) => sum + item.matched, 0), 1);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS c FROM mywatch_notifications WHERE wish_id='w-race'"
  ).get().c, 2);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS c FROM search_watch_matches WHERE wish_id='w-race' AND product_identity_key='AMAZON_JP:B000RACE'"
  ).get().c, 1);
  const ids = sqlite.prepare(
    "SELECT notification_id,event_key FROM mywatch_notifications WHERE wish_id='w-race' ORDER BY channel"
  ).all();
  assert.equal(new Set(ids.map((row) => row.event_key)).size, 1);
  assert.ok(ids.every((row) => /^insight-[a-f0-9]{48}(?:-email)?$/.test(row.notification_id)));
});

test('候補集合(A,B)と(B,C)の並行scanをwish leaseで直列化し、Bを二重本文通知しない', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'member-overlap-race', wishId: 'w-overlap-race', queryText: 'camera', baselined: true
  });
  const wish = sqlite.prepare("SELECT * FROM member_wishes WHERE wish_id='w-overlap-race'").get();
  let releaseFirst;
  let markEntered;
  const entered = new Promise((resolve) => { markEntered = resolve; });
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const firstPromise = scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2026-08-08T03:00:00.000Z', async () => {
    markEntered();
    await gate;
    return [relevantCandidate('A'), relevantCandidate('B')];
  });
  await entered;
  const overlapping = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T03:00:01.000Z',
    async () => [relevantCandidate('B'), relevantCandidate('C')]
  );
  assert.deepEqual(overlapping, { scanned: false, matched: 0, lease_busy: true });
  releaseFirst();
  assert.equal((await firstPromise).matched, 2);
  assert.equal(sqlite.prepare(
    "SELECT COUNT(*) AS total FROM mywatch_notifications WHERE wish_id='w-overlap-race' AND channel='WEB'"
  ).get().total, 1);

  const next = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T03:15:00.000Z',
    async () => [relevantCandidate('B'), relevantCandidate('C')]
  );
  assert.equal(next.matched, 1);
  const ledger = sqlite.prepare(
    "SELECT product_identity_key,notification_id FROM search_watch_matches WHERE wish_id='w-overlap-race' AND product_identity_key<>'INSIGHT_BASELINE' ORDER BY product_identity_key"
  ).all();
  assert.equal(ledger.length, 3);
  assert.equal(ledger.filter((row) => row.product_identity_key === 'AMAZON_JP:B').length, 1);
  assert.equal(new Set(ledger.map((row) => row.notification_id)).size, 2);
});

test('cron遅延が10分を超えてもlease expiryはscheduledTimeでなく実取得時刻から計算する', async () => {
  const { sqlite, db } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'member-delayed-cron', wishId: 'w-delayed-cron', queryText: 'camera', baselined: true
  });
  const wish = sqlite.prepare("SELECT * FROM member_wishes WHERE wish_id='w-delayed-cron'").get();
  let releaseSearch;
  let markEntered;
  const entered = new Promise((resolve) => { markEntered = resolve; });
  const gate = new Promise((resolve) => { releaseSearch = resolve; });
  const before = Date.now();
  const scan = scanWishForNewMatches({ PRODUCT_DB: db }, wish, '2020-01-01T00:00:00.000Z', async () => {
    markEntered();
    await gate;
    return [];
  });
  await entered;
  const lease = sqlite.prepare("SELECT expires_at FROM insight_scan_leases WHERE wish_id='w-delayed-cron'").get();
  assert.ok(Date.parse(lease.expires_at) >= before + 9 * 60 * 1000);
  releaseSearch();
  await scan;
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

test('0065未適用のlegacy DEFAULT1行は明示同意とみなさず一件もscanしない', async () => {
  const { sqlite, db } = sqliteD1({ explicitOptInColumn: false });
  const now = '2026-08-08T00:00:00.000Z';
  sqlite.prepare(
    `INSERT INTO member_wishes
    (member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,created_at,updated_at)
    VALUES('legacy-member','legacy-wish','legacy camera','EN',1,1,0,0,'INSTANT',?,?)`
  ).run(now, now);
  assert.equal(sqlite.prepare("SELECT notify_new_match FROM member_wishes WHERE wish_id='legacy-wish'").get().notify_new_match, 1);
  let invoked = false;
  const result = await runInsightScan({ PRODUCT_DB: db }, now, async () => {
    invoked = true; return { scanned: true, matched: 1 };
  });
  assert.deepEqual(result, { scanned: 0, notifications_sent: 0, truncated: false });
  assert.equal(invoked, false);
});

test('runInsightScan()は未設定をFree tierとして1件までに制限する', async () => {
  const { sqlite, db } = sqliteD1();
  for (let index = 0; index < 4; index += 1) {
    insertWish(sqlite, { memberId: 'm1', wishId: `w-batch-${String(index).padStart(4, '0')}`, queryText: 'カメラ' });
  }
  const result = await runInsightScan({ PRODUCT_DB: db }, '2026-08-08T03:00:00Z');
  assert.equal(result.truncated, true);
  assert.equal(result.scanned, 1);
});

test('runInsightScan()は明示PAID時だけ40件へ広げ、15分ごとに全条件を公平に回す', async () => {
  const { sqlite, db } = sqliteD1();
  for (let index = 0; index < 42; index += 1) {
    insertWish(sqlite, {
      memberId: 'm1', wishId: `w-fair-${String(index).padStart(4, '0')}`, queryText: 'カメラ'
    });
  }
  const scannedWishIds = new Set();
  const recordScan = async (_env, wish) => {
    scannedWishIds.add(wish.wish_id);
    return { scanned: true, matched: 0 };
  };
  const env = { PRODUCT_DB: db, INSIGHT_D1_QUERY_TIER: 'PAID' };
  const first = await runInsightScan(env, '2026-08-08T03:00:00Z', recordScan);
  const second = await runInsightScan(env, '2026-08-08T03:15:00Z', recordScan);
  assert.equal(first.scanned, 40);
  assert.equal(second.scanned, 40);
  assert.equal(first.truncated, true);
  assert.equal(second.truncated, true);
  assert.equal(scannedWishIds.size, 42);
});

test('専用cronのD1実行予算はlease込みでFree 27以下・Paid 963以下に収まる', async () => {
  function countedDb(total) {
    let executions = 0;
    const rows = Array.from({ length: total }, (_, index) => ({
      member_id: 'm1', wish_id: `w-${index}`, query_text: 'camera', language: 'JA', notify_new_match: 1
    }));
    return {
      get executions() { return executions; },
      prepare(sql) {
        return {
          bind(limit, offset) {
            return { all: async () => { executions += 1; return { results: rows.slice(offset, offset + limit) }; } };
          },
          first: async () => { executions += 1; return /COUNT\(\*\)/u.test(sql) ? { total } : { ok: 1 }; }
        };
      }
    };
  }
  const simulateWorstWish = async (env) => {
    for (let index = 0; index < 24; index += 1) await env.PRODUCT_DB.prepare('SELECT 1').first();
    return { scanned: true, matched: 5 };
  };
  const freeDb = countedDb(3);
  const free = await runInsightScan({ PRODUCT_DB: freeDb }, '1970-01-01T00:15:00Z', simulateWorstWish);
  assert.equal(free.scanned, 1);
  assert.ok(freeDb.executions <= 27, `Free query budget exceeded: ${freeDb.executions}`);

  const paidDb = countedDb(41);
  const paid = await runInsightScan({ PRODUCT_DB: paidDb, INSIGHT_D1_QUERY_TIER: 'PAID' }, '1970-01-01T00:15:00Z', simulateWorstWish);
  assert.equal(paid.scanned, 40);
  assert.ok(paidDb.executions <= 963, `Paid query budget exceeded: ${paidDb.executions}`);
});

test('実persist経路もlease・WEB・LINE・EMAIL・5 match込みで1wish 24 statements以内', async () => {
  const { sqlite, db, metrics } = sqliteD1();
  insertWish(sqlite, {
    memberId: 'member-budget-real', wishId: 'w-budget-real', queryText: 'camera', baselined: true
  });
  for (const channel of ['LINE', 'EMAIL']) sqlite.prepare(
    `INSERT INTO member_notification_destinations
    (member_id,channel,encrypted_destination,verified_at,updated_at) VALUES(?,?,?,?,?)`
  ).run('member-budget-real', channel, 'encrypted', '2026-08-08', '2026-08-08');
  const wish = sqlite.prepare("SELECT * FROM member_wishes WHERE wish_id='w-budget-real'").get();
  const before = metrics.executions;
  const result = await scanWishForNewMatches(
    { PRODUCT_DB: db }, wish, '2026-08-08T03:00:00.000Z',
    async () => ['A', 'B', 'C', 'D', 'E'].map(relevantCandidate)
  );
  assert.equal(result.matched, 5);
  assert.ok(metrics.executions - before <= 24,
    `production persistence path exceeded per-wish budget: ${metrics.executions - before}`);
});

test('scheduled()のcronハンドラがrunInsightScanを呼び出す配線になっている', async () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*handleInsightRoutes,\s*runInsightScan\s*\}\s*from\s*'\.\/insight-routes\.mjs'/);
  const scheduledMatch = source.match(/async scheduled\(controller, env, ctx\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(scheduledMatch, 'scheduled()ハンドラが見つかりません');
  assert.match(scheduledMatch[0], /controller\.cron === '1,5,16,20,31,35,46,50 \* \* \* \*'[\s\S]*?\[5, 20, 35, 50\]\.includes\(scheduledAt\.getUTCMinutes\(\)\)[\s\S]*?runInsightScan\(env, scheduledAt\.toISOString\(\)\)[\s\S]*?deliverDueWebNotifications\(env, scheduledAt\)[\s\S]*?deliverDueMemberNotifications\(env, scheduledAt\)[\s\S]*?return;/u);
  const regular = scheduledMatch[0].slice(scheduledMatch[0].indexOf("'cloudflare_regular'"));
  assert.doesNotMatch(regular, /runInsightScan/u);
  assert.doesNotMatch(regular, /deliverDue(?:Web|Member)Notifications/u);
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"1,5,16,20,31,35,46,50 \* \* \* \*"/u);
  assert.equal((wrangler.match(/"[^"\n]+ \* \* \* \*"/gu) || []).length, 4,
    'INSIGHTと配信は別invocationのまま1つのCron Triggerへ集約する');
  const migration = readFileSync(new URL('../migrations/0063_insight_scan_index.sql', import.meta.url), 'utf8');
  assert.match(migration, /ON member_wishes \(wish_id, member_id\)[\s\S]*WHERE notify_new_match = 1/u);
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
  // notify_new_match=1の2件が対象だが、未設定Free tierは1 invocation 1件
  // まで（w-http-3は対象外）。
  // D1索引データを用意していないため実際のマッチ件数は0だが、例外を
  // 投げずに完了することを確認する。
  assert.equal(body.scanned, 1);
});
