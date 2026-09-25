// 2026-09-25 大隆さん指示「メガ割・プライムデーなどをホシル登録して見逃さない」「いつものホシルもバンバン販促」。
// 広告で約束することが実際に届くかを、本物の SQLite で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { enqueueSaleNotifications, listPublicSales, saleNotificationTitle, wantsSaleInfo } from '../src/marketplace-sales.mjs';
import {
  USUAL_REMINDER_BATCH, queueUsualDueNotifications, usualReminderCopy, usualReminderKey, usualReminderWindowOpen
} from '../src/usual-reminders.mjs';

function d1(db) {
  const wrap = (sql) => {
    const statement = db.prepare(sql); let values = [];
    const api = {
      bind(...next) { values = next; return api; },
      async all() { return { results: statement.all(...values) }; },
      async first() { return statement.get(...values) ?? null; },
      async run() { const info = statement.run(...values); return { success: true, meta: { changes: Number(info.changes) } }; }
    };
    return api;
  };
  return { prepare: wrap, async batch(list) { const out = []; for (const item of list) out.push(await item.run()); return out; } };
}

function schema() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE marketplace_sale_events (sale_id TEXT PRIMARY KEY, marketplace TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, announced_at TEXT NOT NULL,
      source_url TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', image_rights_status TEXT NOT NULL DEFAULT 'NONE',
      status TEXT NOT NULL DEFAULT 'DRAFT', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      info_type TEXT NOT NULL DEFAULT 'SALE', video_url TEXT NOT NULL DEFAULT '', video_rights_status TEXT NOT NULL DEFAULT 'NONE');
    CREATE TABLE member_sale_preferences (member_id TEXT PRIMARY KEY, enabled INTEGER, advance_notice INTEGER,
      marketplaces TEXT, info_types TEXT, frequency TEXT, quiet_start TEXT, quiet_end TEXT, language TEXT,
      delivery_channels TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE mywatch_notifications (notification_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, wish_id TEXT NOT NULL,
      event_key TEXT NOT NULL, event_type TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'WEB', title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL, delivered_at TEXT, read_at TEXT, dismissed_at TEXT, last_error_code TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(member_id, wish_id, event_key, channel));
    CREATE TABLE member_sale_notifications (member_id TEXT NOT NULL, sale_id TEXT NOT NULL, notice_type TEXT NOT NULL,
      notification_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(member_id, sale_id, notice_type));
    CREATE TABLE member_usual_items (member_id TEXT NOT NULL, usual_id TEXT NOT NULL, product_key TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', product_url TEXT NOT NULL DEFAULT '',
      marketplace TEXT NOT NULL DEFAULT '', cycle_days INTEGER NOT NULL, cycle_source TEXT NOT NULL DEFAULT 'CHOSEN',
      last_purchased_at TEXT, next_due_at TEXT NOT NULL, exact_only INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (member_id, usual_id));
    CREATE TABLE member_notification_destinations (member_id TEXT NOT NULL, channel TEXT NOT NULL,
      encrypted_destination TEXT NOT NULL, verified_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(member_id, channel));
  `);
  return db;
}

const NOW = new Date('2026-10-07T01:00:00.000Z'); // 10:00 JST
const PRIME = {
  sale_id: 'major-amazon-prime-appreciation-2026-early', marketplace: 'AMAZON_JP', info_type: 'MAJOR_SALE',
  title: 'プライム感謝祭（先行セール）', starts_at: '2026-10-12T15:00:00.000Z', ends_at: '2026-10-15T14:59:00.000Z',
  source_url: 'https://www.amazon.co.jp/deals?tag=hoshilu00-22'
};
function addSale(db, sale, status = 'APPROVED') {
  db.prepare(`INSERT INTO marketplace_sale_events (sale_id,marketplace,info_type,title,summary,starts_at,ends_at,announced_at,source_url,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(sale.sale_id, sale.marketplace, sale.info_type, sale.title, sale.summary || '',
    sale.starts_at, sale.ends_at, '2026-09-25T00:00:00.000Z', sale.source_url, status, '2026-09-25T00:00:00.000Z', sale.updated_at || '2026-09-25T00:00:00.000Z');
}
function addPreference(db, memberId, infoTypes, extra = {}) {
  db.prepare(`INSERT INTO member_sale_preferences VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(memberId, extra.enabled ?? 1,
    extra.advance ?? 1, extra.marketplaces || 'ALL', infoTypes, 'INSTANT', '21:00', '08:00', 'JA', extra.channels || 'APP,LINE', 'x', 'x');
}

test('大型セール（MAJOR_SALE）は SALE を受け取る人にも「大型セールだけ」の人にも届き、他の種類だけの人には届かない', () => {
  assert.equal(wantsSaleInfo('SALE', 'MAJOR_SALE'), true);
  assert.equal(wantsSaleInfo('MAJOR_SALE', 'MAJOR_SALE'), true);
  assert.equal(wantsSaleInfo('COUPON', 'MAJOR_SALE'), false);
  assert.equal(wantsSaleInfo('MAJOR_SALE', 'SALE'), false, '「大型セールだけ」の人に毎日のタイムセールは届かない');
  assert.equal(wantsSaleInfo('', 'SALE'), true, '未設定は SALE 扱い（従来どおり）');
});

test('大型セールの通知の見出しは、セール名と開始日（JST）', () => {
  assert.equal(saleNotificationTitle(PRIME, true, 'Amazon'), '【もうすぐ】プライム感謝祭（先行セール）は10/13から');
  assert.equal(saleNotificationTitle(PRIME, false, 'Amazon'), 'プライム感謝祭（先行セール）が始まりました');
  assert.equal(saleNotificationTitle({ ...PRIME, info_type: 'SALE' }, true, 'Amazon'), 'Amazonのセールを事前にお知らせ');
});

test('大型セールは開始7日前から事前のお知らせが1回だけ積まれ、始まったらもう1回', async () => {
  const db = schema();
  addSale(db, PRIME);
  addPreference(db, 'm-sale', 'SALE');
  addPreference(db, 'm-major', 'MAJOR_SALE');
  addPreference(db, 'm-coupon', 'COUPON');
  addPreference(db, 'm-no-advance', 'SALE', { advance: 0 });
  addPreference(db, 'm-off', 'SALE', { enabled: 0 });
  addPreference(db, 'm-rakuten', 'SALE', { marketplaces: 'RAKUTEN_JP' });
  const env = { PRODUCT_DB: d1(db) };
  // 8日前はまだ積まない
  await enqueueSaleNotifications(env, new Date('2026-10-04T00:00:00.000Z'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mywatch_notifications').get().n, 0);
  await enqueueSaleNotifications(env, NOW);
  await enqueueSaleNotifications(env, new Date(NOW.getTime() + 15 * 60000)); // 2回目は増えない
  const advance = db.prepare(`SELECT member_id, channel, title, event_type FROM mywatch_notifications ORDER BY member_id, channel`).all();
  assert.deepEqual([...new Set(advance.map((row) => row.member_id))], ['m-major', 'm-sale']);
  assert.ok(advance.every((row) => row.event_type === 'SALE_ADVANCE' && row.title === '【もうすぐ】プライム感謝祭（先行セール）は10/13から'));
  assert.deepEqual(advance.filter((row) => row.member_id === 'm-sale').map((row) => row.channel), ['APP', 'LINE']);
  // 始まったら「始まりました」を1回（事前を切った人にも届く）
  await enqueueSaleNotifications(env, new Date('2026-10-12T16:00:00.000Z'));
  const started = db.prepare(`SELECT DISTINCT member_id FROM mywatch_notifications WHERE event_type='SALE_STARTED' ORDER BY member_id`).all().map((row) => row.member_id);
  assert.deepEqual(started, ['m-major', 'm-no-advance', 'm-sale']);
});

test('先の日程の大型セールは、公式ページの自動取得の行（最大52行）に押し出されずに公開一覧に入る', async () => {
  const db = schema();
  for (let i = 0; i < 52; i += 1) {
    addSale(db, { sale_id: `official-notice-${i}`, marketplace: 'RAKUTEN_JP', info_type: 'SALE', title: `t${i}`,
      starts_at: '2026-10-07T00:00:00.000Z', ends_at: '2026-10-08T12:00:00.000Z', source_url: 'https://event.rakuten.co.jp/' });
  }
  addSale(db, PRIME);
  addSale(db, { ...PRIME, sale_id: 'major-amazon-prime-appreciation-2026', title: 'プライム感謝祭', starts_at: '2026-10-15T15:00:00.000Z', ends_at: '2026-10-19T14:59:00.000Z' });
  addSale(db, { ...PRIME, sale_id: 'draft-one', title: '下書き' }, 'DRAFT');
  const sales = await listPublicSales({ PRODUCT_DB: d1(db) }, NOW);
  assert.equal(sales.length, 40);
  assert.deepEqual(sales.slice(0, 2).map((sale) => sale.title), ['プライム感謝祭（先行セール）', 'プライム感謝祭']);
  assert.ok(!sales.some((sale) => sale.title === '下書き'), '下書きは出さない');
});

function addUsual(db, memberId, usualId, name, nextDueAt, cycleDays, status = 'ACTIVE') {
  db.prepare(`INSERT INTO member_usual_items (member_id,usual_id,product_name,cycle_days,next_due_at,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(memberId, usualId, name, cycleDays, nextDueAt, status, 'x', 'x');
}

test('いつものホシル: 「もうすぐ」になったら、アプリ内＋連携済みの LINE／メールに1周期1回だけ知らせる', async () => {
  const db = schema();
  const day = 86_400_000;
  addUsual(db, 'm1', 'u-soon', '洗濯洗剤 詰め替え', new Date(NOW.getTime() + 3 * day).toISOString(), 30); // 3/30=10% → もうすぐ
  addUsual(db, 'm1', 'u-plenty', 'コーヒー豆', new Date(NOW.getTime() + 20 * day).toISOString(), 30); // まだ大丈夫
  addUsual(db, 'm1', 'u-paused', 'ティッシュ', new Date(NOW.getTime() + 1 * day).toISOString(), 30, 'PAUSED');
  addUsual(db, 'm1', 'u-stale', '古いもの', new Date(NOW.getTime() - 20 * day).toISOString(), 30); // 2週間以上前に切れたまま
  addUsual(db, 'm2', 'u-over', 'ドッグフード', new Date(NOW.getTime() - 2 * day).toISOString(), 14); // もう過ぎている
  db.prepare(`INSERT INTO member_notification_destinations VALUES ('m1','LINE','enc','x','x'),('m1','EMAIL','enc','x','x')`).run();
  const env = { PRODUCT_DB: d1(db) };
  assert.deepEqual(await queueUsualDueNotifications(env, NOW), { status: 'OK', queued: 2 });
  assert.deepEqual(await queueUsualDueNotifications(env, new Date(NOW.getTime() + 15 * 60000)), { status: 'OK', queued: 0 }, '同じ周期に2回は送らない');
  const rows = db.prepare(`SELECT member_id, wish_id, channel, event_type, status, title, body, event_key FROM mywatch_notifications ORDER BY member_id, channel`).all();
  assert.deepEqual(rows.map((row) => `${row.member_id}:${row.wish_id}:${row.channel}`), [
    'm1:u-soon:EMAIL', 'm1:u-soon:LINE', 'm1:u-soon:WEB', 'm2:u-over:WEB'
  ]);
  assert.ok(rows.every((row) => row.event_type === 'USUAL_DUE' && row.status === 'PENDING'));
  assert.equal(rows[0].title, 'いつもの「洗濯洗剤 詰め替え」、そろそろです');
  assert.match(rows[0].body, /あと3日くらいでなくなる頃です/u);
  assert.match(rows[0].body, /https:\/\/hoshilu\.app\/\?utm_source=usual_notification&utm_medium=notification#usualHoshiru/u);
  assert.doesNotMatch(rows[0].body, /円|¥/u, '確認していない価格は書かない');
  assert.equal(rows[3].event_key, usualReminderKey('u-over', db.prepare(`SELECT next_due_at FROM member_usual_items WHERE usual_id='u-over'`).get().next_due_at));
  // 「買った！」で次の周期に進めば、次の「もうすぐ」でまた1回だけ届く
  db.prepare(`UPDATE member_usual_items SET next_due_at=? WHERE usual_id='u-over'`).run(new Date(NOW.getTime() + 1 * day).toISOString());
  assert.equal((await queueUsualDueNotifications(env, NOW)).queued, 1);
});

test('いつものホシル: 夜（JST 20時〜9時）は積まない。1回に積むのは上限まで', async () => {
  assert.equal(usualReminderWindowOpen(new Date('2026-10-07T00:00:00.000Z')), true); // 9:00 JST
  assert.equal(usualReminderWindowOpen(new Date('2026-10-06T23:59:00.000Z')), false); // 8:59 JST
  assert.equal(usualReminderWindowOpen(new Date('2026-10-07T11:00:00.000Z')), false); // 20:00 JST
  const db = schema();
  addUsual(db, 'm1', 'u1', '洗剤', NOW.toISOString(), 30);
  assert.deepEqual(await queueUsualDueNotifications({ PRODUCT_DB: d1(db) }, new Date('2026-10-07T12:00:00.000Z')), { status: 'QUIET_HOURS', queued: 0 });
  for (let i = 0; i < USUAL_REMINDER_BATCH + 5; i += 1) addUsual(db, `m${i + 10}`, `x${i}`, `商品${i}`, NOW.toISOString(), 30);
  assert.equal((await queueUsualDueNotifications({ PRODUCT_DB: d1(db) }, NOW)).queued, USUAL_REMINDER_BATCH);
  assert.deepEqual(await queueUsualDueNotifications({}, NOW), { status: 'SKIPPED', queued: 0 });
  assert.equal(usualReminderCopy({ product_name: '', next_due_at: NOW.toISOString(), cycle_days: 30 }, NOW).title, 'いつもの「いつもの商品」、そろそろです');
});

test('配線: いつもののお知らせは15分ごとの cron で積まれ、届け先は既存の配信（WEB／LINE／メール）に乗る', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /import \{ queueUsualDueNotifications \} from '\.\/usual-reminders\.mjs';/u);
  assert.match(index, /queueUsualDueNotifications\(env, scheduledAt\),/u);
  const auth = readFileSync(new URL('../src/member-auth.mjs', import.meta.url), 'utf8');
  assert.match(auth, /\['#hoshiluSearch','#wishTitle','#usualHoshiru','#saleCenterTitle'\]\.includes\(url\.hash\)/u, 'LINE ログイン後に元の場所へ戻れる');
  const delivery = readFileSync(new URL('../src/member-notification-delivery.mjs', import.meta.url), 'utf8');
  assert.match(delivery, /export const MEMBER_DELIVERY_MAX_ATTEMPTS = 6;/u);
  assert.match(delivery, /status=CASE WHEN attempts\+1>=\?5 THEN 'FAILED' ELSE 'PENDING' END/u, '届かない宛先に毎時いつまでも送り直さない');
});

test('再送の上限: 6回目の失敗で FAILED にし、それより前は PENDING に戻す（本物の SQL で確認）', () => {
  const db = schema();
  const delivery = readFileSync(new URL('../src/member-notification-delivery.mjs', import.meta.url), 'utf8');
  const sql = delivery.match(/UPDATE mywatch_notifications SET status=CASE[^`]+/u)[0];
  const insert = db.prepare(`INSERT INTO mywatch_notifications (notification_id,member_id,wish_id,event_key,event_type,channel,title,status,attempts,next_attempt_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'DELIVERING',?,?,?,?)`);
  insert.run('a', 'm', 'w', 'k1', 'USUAL_DUE', 'LINE', 't', 4, 'x', 'x', 'x');
  insert.run('b', 'm', 'w', 'k2', 'USUAL_DUE', 'LINE', 't', 5, 'x', 'x', 'x');
  const update = db.prepare(sql);
  update.run('a', 'LINE_DELIVERY_FAILED', 'later', 'now', 6);
  update.run('b', 'LINE_DELIVERY_FAILED', 'later', 'now', 6);
  const rows = db.prepare('SELECT notification_id, status, attempts FROM mywatch_notifications ORDER BY notification_id').all();
  assert.deepEqual(rows.map((row) => `${row.notification_id}:${row.status}:${row.attempts}`), ['a:PENDING:5', 'b:FAILED:6']);
});

test('会員が増えても1回の cron で積むのは25組まで。残りは次の回で、送り済みは二度と積まない', async () => {
  const { SALE_NOTIFICATION_MAX_NEW_PER_RUN } = await import('../src/marketplace-sales.mjs');
  const db = schema();
  addSale(db, PRIME);
  for (let i = 0; i < 30; i += 1) addPreference(db, `m${String(i).padStart(2, '0')}`, 'SALE', { channels: 'APP' });
  const env = { PRODUCT_DB: d1(db) };
  assert.deepEqual(await enqueueSaleNotifications(env, NOW), { queued: SALE_NOTIFICATION_MAX_NEW_PER_RUN });
  assert.deepEqual(await enqueueSaleNotifications(env, NOW), { queued: 5 });
  assert.deepEqual(await enqueueSaleNotifications(env, NOW), { queued: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mywatch_notifications').get().n, 30);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM member_sale_notifications').get().n, 30);
});
