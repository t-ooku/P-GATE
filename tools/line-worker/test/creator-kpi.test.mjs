import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { creatorKpiSummary, creatorTrackingUrl, handleCreatorKpiRoutes } from '../src/creator-kpi.mjs';
import { classifyGrowthTraffic, creatorSafeId, handleGrowthEvent, normalizeGrowthEvent } from '../src/growth-events.mjs';

function d1(db) {
  return { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { const info = statement.run(...values); return { meta: { changes: Number(info.changes) } }; },
      async all() { return { results: statement.all(...values) }; },
      async first() { return statement.get(...values) ?? null; } }; } };
}
function env({ withCreatorColumns = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE growth_events (event_id TEXT PRIMARY KEY, event_type TEXT, locale TEXT, source TEXT, medium TEXT, campaign TEXT, content TEXT, marketplace TEXT, occurred_at TEXT, traffic_class TEXT, visitor_id TEXT NOT NULL DEFAULT '', session_id TEXT NOT NULL DEFAULT '')`);
  if (withCreatorColumns) db.exec(readFileSync(new URL('../migrations/0070_creator_attribution.sql', import.meta.url), 'utf8'));
  return { db, env: { PRODUCT_DB: d1(db), SOCIAL_ADMIN_SECRET: 'a'.repeat(40) } };
}
const post = (body) => new Request('https://hoshilu.app/api/events', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' }, body: JSON.stringify(body) });
const admin = (path) => new Request(`https://hoshilu.app${path}`, { headers: { authorization: `Bearer ${'a'.repeat(40)}` } });
const V = (n) => `550e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, '0')}`;

test('creator_id / campaign_id / creative_id は SAFE_ID 文法で受け取り、UTM が無くても ATTRIBUTED になる', () => {
  assert.equal(creatorSafeId(' Toridori_AI-001 '), 'toridori_ai-001');
  assert.equal(creatorSafeId('bad id'), '');
  assert.equal(creatorSafeId('-lead'), '');
  const event = normalizeGrowthEvent({ event_type: 'landing_view', creator_id: 'Creator_1', campaign_id: 'sep_launch', creative_id: 'reel a' });
  assert.deepEqual([event.creator_id, event.campaign_id, event.creative_id], ['creator_1', 'sep_launch', '']);
  assert.equal(classifyGrowthTraffic({ creator_id: 'creator_1' }), 'ATTRIBUTED');
  assert.equal(classifyGrowthTraffic({ creator_id: 'creator_1', source: 'codex_qa' }), 'QA');
});

test('イベントは creator 列つきで保存され、列が無い環境では従来の12列へ縮退する', async () => {
  const { env: e, db } = env();
  const response = await handleGrowthEvent(post({ event_type: 'landing_view', creator_id: 'creator_1', campaign_id: 'sep_launch', creative_id: 'reel_a', visitor_id: V(1), session_id: V(2) }), e);
  assert.equal(response.status, 202);
  const row = db.prepare('SELECT creator_id,campaign_id,creative_id,traffic_class FROM growth_events').get();
  assert.deepEqual({ ...row }, { creator_id: 'creator_1', campaign_id: 'sep_launch', creative_id: 'reel_a', traffic_class: 'ATTRIBUTED' });

  const legacy = env({ withCreatorColumns: false });
  const fallback = await handleGrowthEvent(post({ event_type: 'landing_view', creator_id: 'creator_1', visitor_id: V(1), session_id: V(2) }), legacy.env);
  assert.equal(fallback.status, 202);
  assert.deepEqual(await fallback.json(), { ok: true, identity_recorded: true });
  assert.equal(legacy.db.prepare('SELECT COUNT(*) AS c FROM growth_events').get().c, 1);
});

test('Creator → 施策 → クリエイティブの実数KPI（QA除外・セッション単位）と計測URL', async () => {
  const { env: e } = env();
  const send = (body) => handleGrowthEvent(post(body), e);
  // creator_1: セッションA（着地→検索→遷移）、セッションB（着地のみ）
  await send({ event_type: 'landing_view', creator_id: 'creator_1', campaign_id: 'sep_launch', creative_id: 'reel_a', visitor_id: V(1), session_id: V(11) });
  await send({ event_type: 'search_started', creator_id: 'creator_1', campaign_id: 'sep_launch', creative_id: 'reel_a', visitor_id: V(1), session_id: V(11) });
  await send({ event_type: 'marketplace_click', marketplace: 'AMAZON_JP', creator_id: 'creator_1', campaign_id: 'sep_launch', creative_id: 'reel_a', visitor_id: V(1), session_id: V(11) });
  await send({ event_type: 'landing_view', creator_id: 'creator_1', campaign_id: 'sep_launch', creative_id: 'reel_b', visitor_id: V(2), session_id: V(12) });
  // creator_2: QA は除外
  await send({ event_type: 'landing_view', creator_id: 'creator_2', source: 'codex_qa', medium: 'qa', visitor_id: V(3), session_id: V(13) });
  // creator 無しは対象外
  await send({ event_type: 'landing_view', visitor_id: V(4), session_id: V(14) });

  const summary = await creatorKpiSummary(e, { days: 30, creatorId: 'creator_1' });
  assert.equal(summary.columns_ready, true);
  assert.equal(summary.creators.length, 1);
  const c1 = summary.creators[0];
  assert.equal(c1.key, 'creator_1');
  assert.equal(c1.sessions, 2);
  assert.equal(c1.visitors, 2);
  assert.equal(c1.landing_view, 2);
  assert.equal(c1.search_started, 1);
  assert.equal(c1.marketplace_click, 1);
  assert.equal(c1.search_rate, 50);
  assert.equal(summary.campaigns.map((r) => [r.key, r.sessions]).join('|'), 'sep_launch,2');
  assert.deepEqual(summary.creatives.map((r) => [r.key, r.sessions]), [['reel_a', 1], ['reel_b', 1]]);
  assert.equal(summary.totals.sessions, 2);

  const legacy = env({ withCreatorColumns: false });
  const degraded = await creatorKpiSummary(legacy.env, { days: 30 });
  assert.equal(degraded.columns_ready, false);
  assert.deepEqual(degraded.creators, []);

  assert.equal(creatorTrackingUrl({ creator_id: 'Creator_1', campaign_id: 'sep_launch', creative_id: 'reel_a', utm_source: 'instagram', query: '自立するトートバッグ' }),
    'https://hoshilu.app/?q=%E8%87%AA%E7%AB%8B%E3%81%99%E3%82%8B%E3%83%88%E3%83%BC%E3%83%88%E3%83%90%E3%83%83%E3%82%B0&creator_id=creator_1&campaign_id=sep_launch&creative_id=reel_a&utm_source=instagram&utm_medium=influencer');
  assert.throws(() => creatorTrackingUrl({ creator_id: 'bad id' }), /CREATOR_ID_INVALID/u);

  const unauthorized = await handleCreatorKpiRoutes(new Request('https://hoshilu.app/api/admin/creators/summary'), e);
  assert.equal(unauthorized.status, 401);
  const api = await (await handleCreatorKpiRoutes(admin('/api/admin/creators/summary?days=7&creator_id=creator_1'), e)).json();
  assert.equal(api.creators[0].sessions, 2);
  const built = await (await handleCreatorKpiRoutes(admin('/api/admin/creators/url?creator_id=creator_1&path=/shop/with-care'), e)).json();
  assert.equal(built.url, 'https://hoshilu.app/shop/with-care?creator_id=creator_1');
  assert.equal(await handleCreatorKpiRoutes(new Request('https://hoshilu.app/api/events'), e), null);
});

test('クライアントは creator パラメータを30日引き継ぎ、管理画面に Creator計測ページがある', () => {
  const analytics = readFileSync(new URL('../public/growth-analytics.mjs', import.meta.url), 'utf8');
  assert.match(analytics, /hoshilu_creator_attribution/u);
  assert.match(analytics, /params\.get\('creator_id'\)/u);
  assert.match(analytics, /30 \* 24 \* 60 \* 60 \* 1000/u);
  for (const page of ['index.html', 'login.html', 'buzz.html']) {
    assert.match(readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8'), /growth-analytics\.mjs\?v=10/u);
  }
  const adminPage = readFileSync(new URL('../src/admin-sp-api-page.mjs', import.meta.url), 'utf8');
  assert.match(adminPage, /export function adminCreatorsPageResponse/u);
  assert.equal((adminPage.match(/href="\/admin\/creators"/gu) || []).length, 5);
  assert.match(readFileSync(new URL('../public/admin-creators.js', import.meta.url), 'utf8'), /\/api\/admin\/creators\/summary/u);
});
