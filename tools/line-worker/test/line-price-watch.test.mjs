import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  cleanProductName, WATCH_CODE_PATTERN, dropNoticeText, handleLineWatchMessage, handleLineWatchStart, monthlyPushCap,
  runLinePriceWatchCycle, watchCode, watchMessageText
} from '../src/line-price-watch.mjs';

// 2026-11-08 大隆さん（office hours → B「通知で戻ってくる」、「とりあえず進めて」）

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

function setup() {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../migrations/0093_price_observations.sql', import.meta.url), 'utf8'));
  database.exec(readFileSync(new URL('../migrations/0096_line_price_watches.sql', import.meta.url), 'utf8'));
  database.exec(`CREATE TABLE growth_events (event_id TEXT PRIMARY KEY, event_type TEXT, locale TEXT, source TEXT, medium TEXT, campaign TEXT,
    content TEXT, marketplace TEXT, occurred_at TEXT, traffic_class TEXT)`);
  const observe = (key, date, price, name = 'ボアフリース ジャケット レディース') => database.prepare(`INSERT INTO price_observations
      (observation_key, record_key, marketplace, external_product_id, product_name, price, source, observed_date, observed_at)
      VALUES (?,?,'RAKUTEN_JP','x',?,?,'search',?,?)`).run(`${key}:${date}`, key, name, price, date, `${date}T03:00:00Z`);
  return { database, observe, env: { PRODUCT_DB: d1(database), LINE_CHANNEL_ACCESS_TOKEN: 'token' } };
}

const KEY = 'RAKUTEN:shop:item-1';
const NOW = new Date('2026-11-08T03:00:00Z'); // 12:00 JST

test('入口: 記録のある商品だけ、LINE を「見張る：番号」入力済みで開く。クローラは数えない', async () => {
  const { database, observe, env } = setup();
  observe(KEY, '2026-11-07', 4980);
  const fetchImpl = async (url) => {
    assert.equal(url, 'https://api.line.me/v2/bot/info');
    return new Response(JSON.stringify({ basicId: '@hoshilu' }), { status: 200 });
  };
  const response = await handleLineWatchStart(new Request(`https://hoshilu.app/line/watch?key=${encodeURIComponent(KEY)}`), env, { fetchImpl, now: NOW });
  assert.equal(response.status, 302);
  const location = response.headers.get('location');
  const code = await watchCode(KEY);
  assert.match(code, /^[0-9a-f]{10}$/u);
  assert.equal(location, `https://line.me/R/oaMessage/${encodeURIComponent('@hoshilu')}/?${encodeURIComponent(watchMessageText(code, 'ボアフリース ジャケット レディース'))}`);
  assert.equal(database.prepare('SELECT record_key FROM line_watch_codes WHERE code=?').get(code).record_key, KEY);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM growth_events WHERE event_type='line_watch_clicked'").get().n, 1);
  await handleLineWatchStart(new Request(`https://hoshilu.app/line/watch?key=${encodeURIComponent(KEY)}`, { headers: { 'user-agent': 'Googlebot' } }), env,
    { fetchImpl, now: NOW, isCrawler: (ua) => /bot/iu.test(String(ua)) });
  assert.equal(database.prepare("SELECT COUNT(*) n FROM growth_events WHERE event_type='line_watch_clicked'").get().n, 1, 'クローラは数えない');
  // 記録が無い商品は商品ページへ戻す
  const none = await handleLineWatchStart(new Request('https://hoshilu.app/line/watch?key=RAKUTEN%3Ano%3Arecord'), env, { fetchImpl, now: NOW });
  assert.match(none.headers.get('location'), /\/product\?key=RAKUTEN%3Ano%3Arecord&from=line_watch&line=no_record$/u);
});

test('LINE: 「見張る：番号」で見張りを始め、「やめる」で全部止める。それ以外は検索に回す', async () => {
  const { database, observe, env } = setup();
  observe(KEY, '2026-11-07', 4980);
  const code = await watchCode(KEY);
  database.prepare('INSERT INTO line_watch_codes (code, record_key, product_name, created_at) VALUES (?,?,?,?)').run(code, KEY, 'ボアフリース', 't');
  const replies = [];
  const reply = async (text) => { replies.push(text); };
  const event = (text, source = { type: 'user', userId: 'U1' }) => ({ type: 'message', message: { type: 'text', text }, source, replyToken: 'r' });
  assert.equal(await handleLineWatchMessage(event('黒いリュック 軽い'), env, { reply, now: NOW }), false, '普通の検索はそのまま');
  assert.equal(await handleLineWatchMessage(event(watchMessageText(code, 'ボアフリース')), env, { reply, now: NOW }), true);
  const row = database.prepare('SELECT * FROM line_price_watches').get();
  assert.equal(row.line_user_id, 'U1');
  assert.equal(row.start_price, 4980);
  assert.equal(row.status, 'ACTIVE');
  assert.match(replies.at(-1), /4,980円 より下がったら/u);
  assert.doesNotMatch(replies.join('\n'), /買い時|底値/u);
  // グループでは使わない
  assert.equal(await handleLineWatchMessage(event(`見張る：${code}`, { type: 'group', groupId: 'G1' }), env, { reply, now: NOW }), true);
  assert.match(replies.at(-1), /1 対 1/u);
  // 分からない番号
  assert.equal(await handleLineWatchMessage(event('見張る：0000000000'), env, { reply, now: NOW }), true);
  assert.match(replies.at(-1), /見張れません/u);
  assert.equal(await handleLineWatchMessage(event('やめる'), env, { reply, now: NOW }), true);
  assert.equal(database.prepare('SELECT status FROM line_price_watches').get().status, 'STOPPED');
  assert.match('見張る:abcdef0123', WATCH_CODE_PATTERN);
});

test('毎日 19:00 JST: 記録で下がった物だけ、1 日 1 回、月の上限まで LINE で知らせる', async () => {
  const { database, observe, env } = setup();
  observe(KEY, '2026-11-06', 4980);
  database.prepare(`INSERT INTO line_price_watches (line_user_id, record_key, product_name, start_price, notified_price, status, created_at, updated_at, notified_at)
    VALUES ('U1', ?, 'ボアフリース', 4980, 0, 'ACTIVE', 't', 't', '')`).run(KEY);
  const pushes = [];
  const fetchImpl = async (url, init) => { pushes.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  const at19 = new Date('2026-11-08T10:05:00Z'); // 19:05 JST
  assert.equal((await runLinePriceWatchCycle(env, new Date('2026-11-08T09:05:00Z'), { fetchImpl })).reason, 'not_time');
  // 下がっていなければ知らせない
  assert.equal((await runLinePriceWatchCycle(env, at19, { fetchImpl })).notified, 0);
  observe(KEY, '2026-11-08', 4080);
  const first = await runLinePriceWatchCycle(env, at19, { fetchImpl });
  assert.equal(first.notified, 1);
  assert.equal(pushes[0].to, 'U1');
  assert.match(pushes[0].messages[0].text, /4,980円 → 4,080円（11\/08 の記録）/u);
  assert.match(pushes[0].messages[0].text, /https:\/\/hoshilu\.app\/product\?key=RAKUTEN%3Ashop%3Aitem-1&from=line_watch/u);
  assert.doesNotMatch(pushes[0].messages[0].text, /買い時|底値/u);
  // 同じ日にもう一度は送らない。次は 4,080 円より下がった時だけ
  assert.equal((await runLinePriceWatchCycle(env, new Date('2026-11-08T10:10:00Z'), { fetchImpl })).notified, 0);
  assert.equal(database.prepare('SELECT notified_price FROM line_price_watches').get().notified_price, 4080);
  // 月の上限（0 にすると送らない）
  database.prepare("UPDATE line_price_watches SET notified_price=5000, notified_at=''").run();
  const capped = await runLinePriceWatchCycle({ ...env, LINE_WATCH_MONTHLY_PUSH_CAP: '1' }, at19, { fetchImpl });
  assert.equal(capped.notified, 0);
  assert.equal(capped.skipped_cap, 1);
  assert.equal(monthlyPushCap({}), 150);
  // 止めるスイッチ・鍵なし
  assert.equal((await runLinePriceWatchCycle({ ...env, LINE_WATCH_ENABLED: 'false' }, at19, { fetchImpl })).ran, false);
  assert.equal((await runLinePriceWatchCycle({ PRODUCT_DB: env.PRODUCT_DB }, at19, { fetchImpl })).ran, false);
});

test('通知の文面: 記録の事実だけ。止め方を書く', () => {
  const message = dropNoticeText({ productName: '電気毛布 洗える', fromPrice: 3980, toPrice: 3480, observedDate: '2026-11-08', recordKey: 'YAHOO:abc' });
  assert.match(message, /ホシルの記録で下がりました/u);
  assert.match(message, /「やめる」/u);
  assert.doesNotMatch(message, /買い時|底値|今が安い|お得/u);
});

test('値下がりカードにボタン、撮影（SNS の画像）には出さない、クローラには辿らせない', async () => {
  const media = readFileSync(new URL('../src/owned-media.mjs', import.meta.url), 'utf8');
  assert.match(media, /<a class="media-drop-line" href="\/line\/watch\?key=\$\{encodeURIComponent\(row\.record_key\)\}" rel="nofollow">もっと下がったらLINEで知らせる<\/a>/u);
  const shots = readFileSync(new URL('../scripts/build-social-screens.mjs', import.meta.url), 'utf8');
  assert.match(shots, /\.media-drop-line\{display:none!important\}/u);
  assert.match(readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8'), /^Disallow: \/line\/$/mu);
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /url\.pathname === '\/line\/watch'\) return handleLineWatchStart/u);
  assert.match(index, /runLinePriceWatchCycle\(env, scheduledAt\)/u);
  assert.match(index, /\.map\(\(event\) => processLineEventWithWatch\(event, origin, env, ctx\)\)/u);
});

// 2026-11-08 実機で、店の宣伝（クーポン・割引）が付いた商品名がそのまま LINE に出た
test('LINE に出す商品名は、店のセール・クーポンの宣伝を外す', () => {
  assert.equal(cleanProductName('★4日20時〜20％オフクーポン配布！【ロムアンド公式】ロムアンド ザジューシー'), 'ロムアンド ザジューシー');
  assert.equal(cleanProductName('【送料無料】電気毛布 洗える ポイント10倍'), '電気毛布 洗える');
  assert.equal(cleanProductName('ボアフリース ジャケット'), 'ボアフリース ジャケット');
  assert.equal(cleanProductName('【公式】'), '【公式】', '外して空なら元のまま');
  assert.doesNotMatch(watchMessageText('abcdef0123', '★20%OFFクーポン！【公式】リップ ティント'), /クーポン|OFF|【/u);
  assert.match(dropNoticeText({ productName: '【SALE】★最大50%OFF！ダウンコート', fromPrice: 9000, toPrice: 8000, observedDate: '2026-11-09', recordKey: 'k' }), /^「ダウンコート」が/u);
});
