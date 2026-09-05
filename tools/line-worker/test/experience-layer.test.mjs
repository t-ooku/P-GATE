import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  EXPERIENCE_AXES, experienceCategoryFor, experienceSummary, handleExperienceRoutes, normalizeRatings, productKeyFor, scoreToPercent
} from '../src/experience-layer.mjs';

function d1(db) {
  return { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { const info = statement.run(...values); return { meta: { changes: Number(info.changes) } }; },
      async all() { return { results: statement.all(...values) }; },
      async first() { return statement.get(...values) ?? null; } }; } };
}
function env() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0068_experience_reports.sql', import.meta.url), 'utf8'));
  db.exec(`CREATE TABLE growth_events (event_id TEXT PRIMARY KEY, event_type TEXT, locale TEXT, source TEXT, medium TEXT, campaign TEXT, content TEXT, marketplace TEXT, occurred_at TEXT, traffic_class TEXT)`);
  return { db, env: { PRODUCT_DB: d1(db), LINK_SIGNING_SECRET: 's'.repeat(64) } };
}
const post = (path, body, extra = {}) => new Request(`https://hoshilu.app${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' }, body: JSON.stringify(body), ...extra });

test('経験軸はカテゴリごとに動的（バッグ・服・靴・コスメ・家電・その他）', () => {
  assert.equal(experienceCategoryFor('自立する本革トートバッグ'), 'BAG');
  assert.equal(experienceCategoryFor('ロングワンピース 夏'), 'APPAREL');
  assert.equal(experienceCategoryFor('ナイキ エアマックス スニーカー'), 'SHOES');
  assert.equal(experienceCategoryFor('rom&nd ジューシーラスティングティント'), 'COSMETICS');
  assert.equal(experienceCategoryFor('コードレス掃除機'), 'APPLIANCE');
  assert.equal(experienceCategoryFor('コアラマットレス'), 'GENERIC');
  assert.deepEqual(EXPERIENCE_AXES.BAG.map(([k]) => k), ['stand', 'light', 'capacity', 'laptop', 'shoulder', 'scratch', 'photo']);
  assert.equal(scoreToPercent([5, 5, 4]), 92);
  assert.equal(scoreToPercent([1]), 0);
  assert.equal(scoreToPercent([]), null);
  assert.deepEqual(normalizeRatings('BAG', { stand: 5, light: '4', bogus: 5, capacity: 9 }), { stand: 5, light: 4 });
});

test('商品名の正規化ハッシュで同じ商品をまとめる', async () => {
  const a = await productKeyFor('【公式】 ロングワンピース（ブラック）');
  const b = await productKeyFor('公式 ロングワンピース ブラック');
  assert.equal(a, b);
  assert.equal(await productKeyFor(''), '');
});

test('投稿はログイン必須、1人1商品1件（上書き）、集計は％で返り、検索文や個人情報を保存しない', async () => {
  const { env: e, db } = env();
  const guest = await handleExperienceRoutes(post('/api/experience/report', { name: 'X', ratings: { stand: 5, light: 4 } }), e, { readMember: async () => null });
  assert.equal(guest.status, 401);
  const member = { readMember: async () => ({ id: 'member-1' }) };
  const first = await handleExperienceRoutes(post('/api/experience/report', {
    name: '自立する本革トートバッグ', query: 'Instagramで見た白いバッグ', ratings: { stand: 5, light: 3, capacity: 5 }, would_buy_again: true,
    comment: '軽くて自立します。連絡は test@example.com 090-1234-5678 まで'
  }), e, member);
  assert.equal(first.status, 200);
  const summary = (await first.json()).summary;
  assert.equal(summary.category, 'BAG');
  assert.equal(summary.count, 1);
  assert.equal(summary.axes.find((a) => a.key === 'stand').percent, 100);
  assert.equal(summary.axes.find((a) => a.key === 'light').percent, 50);
  assert.equal(summary.axes.find((a) => a.key === 'laptop').percent, null);
  assert.equal(summary.would_buy_again_percent, 100);
  assert.doesNotMatch(summary.comments[0].text, /example\.com|090/u);
  // 同じ会員の再投稿は上書き
  const second = await handleExperienceRoutes(post('/api/experience/report', { name: '自立する本革トートバッグ', ratings: { stand: 1, light: 1 }, would_buy_again: false }), e, member);
  assert.equal((await second.json()).summary.count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM experience_reports').get().c, 1);
  // 別会員が加わると平均
  await handleExperienceRoutes(post('/api/experience/report', { name: '自立する本革トートバッグ', ratings: { stand: 5, light: 5 }, would_buy_again: true }), e, { readMember: async () => ({ id: 'member-2' }) });
  const merged = await experienceSummary(e.PRODUCT_DB, { productName: '自立する本革トートバッグ' });
  assert.equal(merged.count, 2);
  assert.equal(merged.axes.find((a) => a.key === 'stand').percent, 50);
  assert.equal(merged.would_buy_again_percent, 50);
  // 保存内容に検索文は無い
  const row = db.prepare('SELECT * FROM experience_reports LIMIT 1').get();
  assert.equal('query' in row, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM growth_events WHERE event_type='experience_posted'").get().c, 3);
  // 2項目未満は拒否
  const thin = await handleExperienceRoutes(post('/api/experience/report', { name: 'Y', ratings: { quality: 5 } }), e, member);
  assert.equal(thin.status, 400);
});

test('集計APIは最大12件をまとめて返し、投稿0件でも軸を返す（UIが投稿導線を出せる）', async () => {
  const { env: e } = env();
  const response = await handleExperienceRoutes(post('/api/experience/summaries', { items: [{ name: 'rom&nd リップ' }, { name: '' }], query: '韓国コスメ' }), e);
  const payload = await response.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].category, 'COSMETICS');
  assert.equal(payload.items[0].count, 0);
  assert.equal(payload.items[0].axes.length, 5);
  const cross = await handleExperienceRoutes(post('/api/experience/summaries', { items: [] }, { headers: { origin: 'https://evil.example', 'content-type': 'application/json' } }), e);
  assert.equal(cross.status, 403);
});

test('トップページは experience-layer を読み込み、クライアントは .product-card を監視して差し込む', async () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /experience-layer\.mjs\?v=2/u);
  assert.match(html, /experience-layer\.css\?v=14/u);
  const client = readFileSync(new URL('../public/experience-layer.mjs', import.meta.url), 'utf8');
  assert.match(client, /MutationObserver/u);
  assert.match(client, /\/api\/experience\/summaries/u);
  assert.match(client, /\/api\/experience\/report/u);
  assert.match(client, /login\.html\?next=/u);
});
