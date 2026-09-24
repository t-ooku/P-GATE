// 2026-09-24 大隆さん決定: アプリ内ブラウザで Turnstile が通らない人のため、文字だけの検索に限り
// トークン無しを上限付きで通す（同じ接続元は1時間3回・全体で1日100回・止められる）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  TOKENLESS_DAILY_LIMIT_DEFAULT, TOKENLESS_EVENT_TYPE, TOKENLESS_PER_IP_HOURLY,
  admitTokenlessSearch, jstDayStart, tokenlessClientAddress, tokenlessClientKey, tokenlessDailyLimit, tokenlessSearchEnabled
} from '../src/tokenless-search.mjs';

function envWithDb(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE growth_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, locale TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '', marketplace TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL,
    traffic_class TEXT NOT NULL DEFAULT 'UNATTRIBUTED')`);
  const env = {
    TURNSTILE_SECRET_KEY: 'secret-for-test', ...extra,
    PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
      return {
        bind(...next) { values = next; return this; },
        // D1 と同じく meta.changes を返す。await を挟んで、同時に来た依頼が入り混じるようにする。
        async run() { await new Promise((resolve) => setTimeout(resolve, 1)); const info = statement.run(...values); return { success: true, meta: { changes: Number(info.changes) } }; },
        async first() { return statement.get(...values) ?? null; }
      }; } }
  };
  return { db, env };
}
const req = (ip) => ({ headers: { get: (name) => (name === 'cf-connecting-ip' ? ip : null) } });
const NOON = new Date('2026-09-25T03:00:00.000Z'); // 12:00 JST

test('同じ接続元は1時間に3回まで。4回目は止める', async () => {
  const { env } = envWithDb();
  for (let i = 0; i < TOKENLESS_PER_IP_HOURLY; i += 1) {
    assert.equal(await admitTokenlessSearch(env, req('203.0.113.7'), new Date(NOON.getTime() + i * 1000)), true);
  }
  await assert.rejects(() => admitTokenlessSearch(env, req('203.0.113.7'), new Date(NOON.getTime() + 5000)), /TURNSTILE_TOKENLESS_RATE_LIMITED/u);
  // 別の接続元は通る
  assert.equal(await admitTokenlessSearch(env, req('198.51.100.2'), new Date(NOON.getTime() + 6000)), true);
  // 1時間たてば同じ接続元もまた通る
  assert.equal(await admitTokenlessSearch(env, req('203.0.113.7'), new Date(NOON.getTime() + 61 * 60 * 1000)), true);
});

test('全体の1日の上限を超えたら止める（上限は環境変数で変えられる）', async () => {
  const { env } = envWithDb({ TOKENLESS_SEARCH_DAILY_LIMIT: '4' });
  for (let i = 0; i < 4; i += 1) {
    assert.equal(await admitTokenlessSearch(env, req(`192.0.2.${i + 1}`), new Date(NOON.getTime() + i * 1000)), true);
  }
  await assert.rejects(() => admitTokenlessSearch(env, req('192.0.2.99'), new Date(NOON.getTime() + 9000)), /TURNSTILE_TOKENLESS_DAILY_LIMIT/u);
  // 翌日（JST）になれば数え直す
  const tomorrow = new Date(jstDayStart(NOON).getTime() + 24 * 60 * 60 * 1000 + 1000);
  assert.equal(await admitTokenlessSearch(env, req('192.0.2.99'), tomorrow), true);
});

test('上限の既定は1日100回、上げても500回まで。止めるスイッチがある', () => {
  assert.equal(TOKENLESS_DAILY_LIMIT_DEFAULT, 100);
  assert.equal(tokenlessDailyLimit({}), 100);
  assert.equal(tokenlessDailyLimit({ TOKENLESS_SEARCH_DAILY_LIMIT: '250' }), 250);
  assert.equal(tokenlessDailyLimit({ TOKENLESS_SEARCH_DAILY_LIMIT: '99999' }), 500);
  assert.equal(tokenlessDailyLimit({ TOKENLESS_SEARCH_DAILY_LIMIT: 'abc' }), 100);
  assert.equal(tokenlessSearchEnabled({}), true);
  for (const off of ['false', 'FALSE', '0', 'off', 'no']) assert.equal(tokenlessSearchEnabled({ TOKENLESS_SEARCH_ENABLED: off }), false, off);
  assert.equal(tokenlessSearchEnabled({ TOKENLESS_SEARCH_ENABLED: 'true' }), true);
});

test('同時にたくさん来ても上限を超えない（数えるのと書くのを1回で行う）', async () => {
  const { db, env } = envWithDb({ TOKENLESS_SEARCH_DAILY_LIMIT: '5' });
  const sameIp = await Promise.allSettled(Array.from({ length: 20 }, () => admitTokenlessSearch(env, req('203.0.113.7'), NOON)));
  assert.equal(sameIp.filter((r) => r.status === 'fulfilled').length, TOKENLESS_PER_IP_HOURLY);
  const many = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => admitTokenlessSearch(env, req(`192.0.2.${i + 1}`), NOON)));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_events').get().n, 5);
  assert.ok(many.filter((r) => r.status === 'rejected').every((r) => /TURNSTILE_TOKENLESS_DAILY_LIMIT/u.test(r.reason.message)));
});

test('D1 が失敗したら 429 用のコードにする（生のエラー文を返さない・画面は再試行しない）', async () => {
  const env = { TURNSTILE_SECRET_KEY: 's', PRODUCT_DB: { prepare() { throw new Error('D1_ERROR: no such table'); } } };
  await assert.rejects(() => admitTokenlessSearch(env, req('203.0.113.7'), NOON), /^Error: TURNSTILE_TOKENLESS_UNAVAILABLE$/u);
});

test('IPv6 は /64 でまとめて数える（住所を替えて回数を稼げない）', async () => {
  assert.equal(tokenlessClientAddress('203.0.113.7'), '203.0.113.7');
  assert.equal(tokenlessClientAddress('2001:db8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(tokenlessClientAddress('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(tokenlessClientAddress('2001:db8::5'), '2001:db8:0:0::/64');
  assert.equal(tokenlessClientAddress('::ffff:198.51.100.4'), '198.51.100.4');
  assert.notEqual(tokenlessClientAddress('::ffff:198.51.100.4'), tokenlessClientAddress('::ffff:198.51.100.5'));
  const { env } = envWithDb();
  for (let i = 0; i < TOKENLESS_PER_IP_HOURLY; i += 1) {
    assert.equal(await admitTokenlessSearch(env, req(`2001:db8:1:2::${i + 1}`), NOON), true);
  }
  await assert.rejects(() => admitTokenlessSearch(env, req('2001:db8:1:2:ffff::9'), NOON), /TURNSTILE_TOKENLESS_RATE_LIMITED/u);
});

test('止めているとき・接続元が分からないときは通さない', async () => {
  const { env } = envWithDb({ TOKENLESS_SEARCH_ENABLED: 'false' });
  await assert.rejects(() => admitTokenlessSearch(env, req('203.0.113.7'), NOON), /TURNSTILE_TOKENLESS_DISABLED/u);
  const { env: env2 } = envWithDb();
  await assert.rejects(() => admitTokenlessSearch(env2, req(''), NOON), /TURNSTILE_TOKENLESS_UNAVAILABLE/u);
  await assert.rejects(() => admitTokenlessSearch({}, req('203.0.113.7'), NOON), /TURNSTILE_TOKENLESS_UNAVAILABLE/u);
});

test('IP はそのまま残さない。日ごとに変わるハッシュの先頭16桁だけ', async () => {
  const { db, env } = envWithDb();
  await admitTokenlessSearch(env, req('203.0.113.7'), NOON);
  const rows = db.prepare('SELECT * FROM growth_events').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_type, TOKENLESS_EVENT_TYPE);
  assert.match(rows[0].content, /^ip:[0-9a-f]{16}$/u);
  assert.ok(!JSON.stringify(rows).includes('203.0.113.7'), '生のIPが残っている');
  const today = await tokenlessClientKey('203.0.113.7', env, NOON);
  const tomorrow = await tokenlessClientKey('203.0.113.7', env, new Date(NOON.getTime() + 24 * 60 * 60 * 1000));
  assert.notEqual(today, tomorrow, '日をまたいで同じ人を追えない');
});

test('検索の入口: 文字だけならトークン無しを受け、写真・投稿URLは従来どおりトークン必須', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /import \{ admitTokenlessSearch \} from '\.\/tokenless-search\.mjs';/u);
  assert.match(index, /if \(turnstileToken\.length > 2048 \|\| \(!turnstileToken && \(socialUrl \|\| searchImage\)\)\) throw new Error\('TURNSTILE_TOKEN_INVALID'\);/u);
  assert.match(index, /if \(validatedInput\.turnstile_token\) \{\s*await verifyTurnstile\(validatedInput\.turnstile_token, env, request\.headers\.get\('cf-connecting-ip'\)\);\s*\} else \{[\s\S]{0,200}await admitTokenlessSearch\(env, request\);/u);
  // 空のトークンは他の入口でも siteverify に送らず無効
  assert.match(index, /if \(!String\(token \|\| ''\)\.trim\(\)\) throw new Error\('TURNSTILE_TOKEN_INVALID'\);/u);
  // 上限超えは 429（500 にすると画面が再試行してしまう）
  assert.match(index, /code\.startsWith\('TURNSTILE_TOKENLESS_'\) \? 429/u);
  // トークン無しの検索からは、共有の答え置き場（rememberIdentifyAnswer）に書かない
  assert.match(index, /const verifiedHuman = options\.internalQa === true \|\| Boolean\(validatedInput\.turnstile_token\);\s*if \(verifiedHuman && validatedInput\.ai_candidate_fallback/u);
  // トークン無しを受けるのは /api/knowledge だけ。他の入口の検証器は空を弾いたまま
  assert.equal((index.match(/if \(!turnstileToken \|\| turnstileToken\.length > 2048\) throw new Error\('TURNSTILE_TOKEN_INVALID'\);/gu) || []).length, 3);
});

test('画面: 文字だけの検索は短く待ってトークン無しで送る。上限超えは再試行せず従来の案内に戻す', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.equal(app, readFileSync(new URL('../public/assets-v147/app.js', import.meta.url), 'utf8'));
  assert.match(app, /const TOKENLESS_FALLBACK_WAIT_MS=3500;/u);
  // 時間切れのあとに来たトークンを捨てない・描き直さない（通常の取得を走らせっぱなしにしない）
  const fn = app.slice(app.indexOf('function tokenOrTokenless('), app.indexOf('\n}\n', app.indexOf('function tokenOrTokenless(')));
  assert.doesNotMatch(fn, /waitForTurnstileToken|recoverTurnstileWidget/u);
  assert.match(fn, /if\(abandoned\|\|!token\|\|token===lastIssuedTurnstileToken\)return '';/u);
  assert.match(app, /const token=hasSupplementalInput\?await waitForTurnstileToken\(tokenWaitBudget\):await tokenOrTokenless\(tokenWaitBudget\);/u);
  assert.match(app, /if\(!token&&hasSupplementalInput\)throw new Error\('TURNSTILE_TOKEN_UNAVAILABLE'\);/u);
  assert.match(app, /!\/\^TURNSTILE_TOKENLESS_\/u\.test\(value\)/u, 'TOKENLESS は再試行しない');
  assert.match(app, /failureTelemetry\.error_code==='TURNSTILE_TOKEN_UNAVAILABLE'\|\|\/\^TURNSTILE_TOKENLESS_\/u\.test\(failureTelemetry\.error_code\)/u);
});
