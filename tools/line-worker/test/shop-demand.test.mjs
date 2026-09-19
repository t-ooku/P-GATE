import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  demandConditions, demandKey, demandQueryProblem, filterConditions, handleShopDemandRoutes, judgeTitle, registerDemandOffer,
  rematchDemand, runShopDemandRematch, searchAcrossShops, sellerDemandOverview, SHOP_DEMAND_EVENT_TYPE
} from '../src/shop-demand.mjs';
import { handleSellerShopRoutes, resetShopCache } from '../src/seller-shop.mjs';

// 2026-09-17 大隆さん「HOSHILU SHOP全面強化」指示書 P0:
// 横断検索 → 条件一致/近い/見つからない → 探し中需要 → Seller に匿名集計 → 商品登録で再判定 → 本人に通知

function d1(db) {
  const statementFor = (sql) => { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { const info = statement.run(...values); return { meta: { changes: Number(info.changes) } }; },
      async all() { return { results: statement.all(...values) }; },
      async first() { return statement.get(...values) ?? null; } }; };
  return { prepare: statementFor, async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; } };
}
const SELLER_KEY = 'IGpFO0_7Xfi6mheMC2-HbGubdYIQPkGlda_gsSFmTKo';
function makeEnv() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_product_search.sql', '0067_seller_billing_stripe.sql', '0069_seller_shops.sql', '0078_seller_shop_business_identity.sql', '0079_shop_demand.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  db.exec(`CREATE TABLE sp_api_listings (tenant TEXT, merchant_id TEXT, seller_sku TEXT, asin TEXT, product_name TEXT, image_url TEXT, buyable INTEGER, price REAL, product_url TEXT, updated_at TEXT, observed_at TEXT)`);
  db.exec(`CREATE TABLE marketplace_offers (tenant TEXT, asin TEXT, record_key TEXT, marketplace TEXT, seller_id TEXT, product_url TEXT, price REAL, stock_status TEXT, active INTEGER, observed_at TEXT)`);
  db.exec(`CREATE TABLE mywatch_notifications (notification_id TEXT PRIMARY KEY, member_id TEXT, wish_id TEXT, event_key TEXT, event_type TEXT, channel TEXT, title TEXT, body TEXT, status TEXT, attempts INTEGER, next_attempt_at TEXT, delivered_at TEXT, read_at TEXT, dismissed_at TEXT, last_error_code TEXT DEFAULT '', created_at TEXT, updated_at TEXT, asin TEXT DEFAULT '', marketplace TEXT DEFAULT '', image_url TEXT DEFAULT '', result_url TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE member_notification_destinations (member_id TEXT, channel TEXT, encrypted_destination TEXT, verified_at TEXT)`);
  db.prepare(`INSERT INTO seller_billing_accounts(seller_key,account_name,contact_email,tenants,plan,payment_preference,status,created_at,updated_at)
    VALUES(?1,'ITG GROUP','a@example.com','["itg"]','BUSINESS','CARD','ACTIVE','2026-09-04T00:00:00Z','2026-09-04T00:00:00Z')`).run(SELLER_KEY);
  db.prepare(`INSERT INTO seller_shops(seller_key,slug,shop_name,tagline,intro,logo_url,cover_url,website_url,tenants,seller_ids,status,created_at,updated_at)
    VALUES(?1,'find-fun','Find fun','','','','','','["itg"]','[]','ACTIVE','2026-09-04T00:00:00Z','2026-09-04T00:00:00Z')`).run(SELLER_KEY);
  const product = (key, asin, name, stock = 3) => db.prepare(`INSERT INTO products(tenant,record_key,asin,sku,product_name,manufacturer,image_url,stock,amazon_jp_url,amazon_us_url,search_aliases,localized_content,row_hash,imported_at)
    VALUES('itg',?1,?2,?1,?3,'ITG','https://img.example/'||?1||'.jpg',?4,'https://www.amazon.co.jp/dp/'||?2,'','','',?1,'2026-09-01T00:00:00Z')`).run(key, asin, name, stock);
  product('r1', 'B000000001', '自立する本革トートバッグ ネイビー A4');
  product('r3', 'B000000003', 'ナイロンリュック ブラック Mサイズ');
  resetShopCache();
  return { db, env: { PRODUCT_DB: d1(db) } };
}
const request = (path, method = 'GET', body = null) => new Request(`https://hoshilu.app${path}`, {
  method, headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app', 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'test' }, body: body ? JSON.stringify(body) : undefined
});

test('検索文から、商品名で判定できる条件（色・素材・サイズ・名詞）だけを取り出す', () => {
  const conditions = demandConditions('黒の本革で自立するA4トートバッグ');
  assert.deepEqual(conditions.map((c) => c.label), ['黒', '本革', 'A4', '自立', 'トートバッグ']);
  assert.equal(demandKey('  黒の本革  トート、A4 '), '黒の本革 トート a4');
  assert.equal(demandQueryProblem('黒 トート'), '');
  assert.equal(demandQueryProblem('連絡先 a@example.com'), 'QUERY_CONTAINS_CONTACT');
  assert.equal(demandQueryProblem('090-1234-5678 に電話'), 'QUERY_CONTAINS_NUMBER');
});

test('判定は商品名に明記された語だけ: 全部あれば一致、半分以上なら近い、何が違うかを返す', () => {
  const conditions = demandConditions('黒の本革で自立するA4トートバッグ');
  assert.deepEqual(judgeTitle('自立する本革トートバッグ ブラック A4', conditions), { level: 'EXACT', matched: ['黒', '本革', 'A4', '自立', 'トートバッグ'], unmatched: [] });
  const near = judgeTitle('自立する本革トートバッグ ネイビー A4', conditions);
  assert.equal(near.level, 'NEAR');
  assert.deepEqual(near.unmatched, ['黒']);
  assert.equal(judgeTitle('ナイロンリュック ブラック', conditions).level, 'NONE');
});

test('横断検索は登録ショップの商品を 条件一致/近い に分け、ショップ名を必ず付ける', async () => {
  const { env } = makeEnv();
  const result = await searchAcrossShops(env, '黒の本革で自立するA4トートバッグ');
  assert.equal(result.shops_searched, 1);
  assert.equal(result.exact.length, 0);
  assert.equal(result.near.length, 1);
  assert.equal(result.near[0].shop.name, 'Find fun');
  assert.deepEqual(result.near[0].unmatched, ['黒']);
  assert.match(result.near[0].url, /amazon\.co\.jp\/dp\/B000000001/);
  const asin = await searchAcrossShops(env, 'B000000003');
  assert.equal(asin.exact.length, 1);
  assert.equal(asin.exact[0].level, 'EXACT');
});

test('公開ルート: 検索は匿名ログを残し、見つからなければ探し中需要を保存でき、ログイン後に紐付けできる', async () => {
  const { db, env } = makeEnv();
  const searched = await handleShopDemandRoutes(request('/api/shops/search?q=' + encodeURIComponent('赤いシリコン製の犬用知育玩具')), env);
  const payload = await searched.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.state, 'NONE');
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM shop_search_log WHERE result_state='NONE'`).get().c, 1);
  const saved = await handleShopDemandRoutes(request('/api/shops/demand', 'POST', { query: '赤いシリコン製の犬用知育玩具', result_state: 'NONE' }), env, { readMember: async () => null });
  const demand = await saved.json();
  assert.equal(demand.ok, true);
  assert.equal(demand.member, false);
  assert.match(demand.demand_id, /^sd-/);
  const row = db.prepare(`SELECT member_id,visitor_hash,status FROM shop_demand_requests WHERE demand_id=?1`).get(demand.demand_id);
  assert.equal(row.member_id, '');
  assert.equal(row.visitor_hash.length, 32);
  const rejected = await handleShopDemandRoutes(request('/api/shops/demand', 'POST', { query: 'メール a@b.co へ連絡' }), env, { readMember: async () => null });
  assert.equal(rejected.status, 400);
  const claimed = await handleShopDemandRoutes(request('/api/shops/demand/claim', 'POST', { demand_ids: [demand.demand_id] }), env, { readMember: async () => ({ id: 'm1' }) });
  assert.deepEqual(await claimed.json(), { ok: true, claimed: 1 });
  const denied = await handleShopDemandRoutes(request('/api/shops/demand/claim', 'POST', { demand_ids: [demand.demand_id] }), env, { readMember: async () => null });
  assert.equal(denied.status, 401);
});

test('Seller には需要が匿名集計で見え、商品を登録すると HOSHILU が再判定し、一致した時だけ本人に通知する', async () => {
  const { db, env } = makeEnv();
  const seller = { seller_key: SELLER_KEY, account: 'ITG', tenants: ['itg'], plan: 'BUSINESS' };
  await handleShopDemandRoutes(request('/api/shops/demand', 'POST', { query: '黒の本革で自立するA4トートバッグ', result_state: 'NEAR' }), env, { readMember: async () => ({ id: 'm1' }) });
  db.prepare(`INSERT INTO member_notification_destinations(member_id,channel,encrypted_destination,verified_at) VALUES('m1','EMAIL','x','2026-09-01T00:00:00Z')`).run();
  // 2026-09-17 第2指示書: 匿名需要が 5 人未満の項目は Seller に出さない（件数だけ知らせる）
  const hidden = await sellerDemandOverview(env, SELLER_KEY);
  assert.equal(hidden.min_people, 5);
  assert.equal(hidden.items.length, 0);
  assert.deepEqual(hidden.below_threshold, { groups: 1, people: 1 });
  const overview = await sellerDemandOverview(env, SELLER_KEY, { minPeople: 1 });
  assert.equal(overview.items.length, 1);
  assert.equal(overview.items[0].people, 1);
  assert.equal(overview.items[0].own_exact, 0);
  assert.equal(overview.items[0].own_near, 1);
  assert.equal(overview.items[0].state, '近い商品あり');
  // 検索文そのものは Seller に渡さず、正規化した条件だけを見せる
  assert.deepEqual(overview.items[0].conditions, ['黒', '本革', 'A4', '自立', 'トートバッグ']);
  assert.equal(overview.items[0].query, '黒・本革・A4・自立・トートバッグ');
  assert.equal(JSON.stringify(overview).includes('黒の本革で自立するA4トートバッグ'), false);
  env.SHOP_DEMAND_SELLER_MIN_PEOPLE = '1';
  const page = await handleSellerShopRoutes(request('/api/seller/shop/demand'), env, seller);
  const pageBody = await page.json();
  assert.equal(pageBody.items[0].query, '黒・本革・A4・自立・トートバッグ');
  assert.equal(pageBody.min_people, 1);
  // 本人は「探しているもの」で自分の需要を見られ、やめることもできる
  const mine = await handleShopDemandRoutes(request('/api/shops/demand/mine'), env, { readMember: async () => ({ id: 'm1' }) });
  const mineBody = await mine.json();
  assert.equal(mineBody.items.length, 1);
  assert.equal(mineBody.items[0].query, '黒の本革で自立するA4トートバッグ');
  assert.equal(mineBody.items[0].status, 'OPEN');
  assert.equal((await handleShopDemandRoutes(request('/api/shops/demand/mine'), env, { readMember: async () => null })).status, 401);
  // 近い商品（ネイビー）を登録しても、保存時に既に近い商品があった需要には通知しない（自己申告で一致にしない）
  const near = await registerDemandOffer(env, SELLER_KEY, { demand_key: demandKey('黒の本革で自立するA4トートバッグ'), asin: 'B000000001' });
  assert.equal(near.level, 'NEAR');
  assert.equal(near.notified, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM mywatch_notifications`).get().c, 0);
  // 条件どおりの商品（ブラック）が入ると一致 → WEB + EMAIL の通知、需要は MATCHED
  db.prepare(`INSERT INTO products(tenant,record_key,asin,sku,product_name,manufacturer,image_url,stock,amazon_jp_url,amazon_us_url,search_aliases,localized_content,row_hash,imported_at)
    VALUES('itg','r9','B000000009','r9','自立する本革トートバッグ ブラック A4','ITG','https://img.example/r9.jpg',3,'https://www.amazon.co.jp/dp/B000000009','','','','r9','2026-09-17T00:00:00Z')`).run();
  const exact = await registerDemandOffer(env, SELLER_KEY, { demand_key: demandKey('黒の本革で自立するA4トートバッグ'), asin: 'B000000009' });
  assert.equal(exact.level, 'EXACT');
  assert.equal(exact.notified, 1);
  const notifications = db.prepare(`SELECT channel,status,event_type,result_url,body FROM mywatch_notifications ORDER BY channel`).all();
  assert.deepEqual(notifications.map((n) => [n.channel, n.status, n.event_type]), [['EMAIL', 'PENDING', SHOP_DEMAND_EVENT_TYPE], ['WEB', 'DELIVERED', SHOP_DEMAND_EVENT_TYPE]]);
  assert.match(notifications[1].result_url, /^https:\/\/hoshilu\.app\/\?shop_search=/);
  assert.match(notifications[1].body, /Find fun/);
  assert.equal(db.prepare(`SELECT status,matched_level,matched_shop_slug FROM shop_demand_requests`).get().status, 'MATCHED');
  const unknown = await registerDemandOffer(env, SELLER_KEY, { demand_key: demandKey('黒の本革で自立するA4トートバッグ'), asin: 'B000000099' }).catch((error) => error.message);
  assert.equal(unknown, 'PRODUCT_NOT_IN_YOUR_SHOP');
  const closed = await handleShopDemandRoutes(request('/api/shops/demand/' + mineBody.items[0].demand_id, 'DELETE'), env, { readMember: async () => ({ id: 'm1' }) });
  assert.deepEqual(await closed.json(), { ok: true, closed: 1 });
  assert.equal(db.prepare(`SELECT status FROM shop_demand_requests`).get().status, 'CLOSED');
  const other = await handleShopDemandRoutes(request('/api/shops/demand/' + mineBody.items[0].demand_id, 'DELETE'), env, { readMember: async () => ({ id: 'm2' }) });
  assert.deepEqual(await other.json(), { ok: true, closed: 0 });
});

test('15分ごとの再判定: 商品が同期で増えていれば OPEN の需要を一致させ通知する', async () => {
  const { db, env } = makeEnv();
  await handleShopDemandRoutes(request('/api/shops/demand', 'POST', { query: 'ナイロン リュック ブラック', result_state: 'NONE' }), env, { readMember: async () => ({ id: 'm2' }) });
  const first = await runShopDemandRematch(env);
  assert.deepEqual(first, { scanned: 1, matched: 1 });
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM mywatch_notifications WHERE member_id='m2' AND channel='WEB'`).get().c, 1);
  assert.equal(db.prepare(`SELECT status FROM shop_demand_requests`).get().status, 'MATCHED');
  const second = await runShopDemandRematch(env);
  assert.deepEqual(second, { scanned: 0, matched: 0 });
  // 見つからないままの需要は last_checked_at だけ進む
  await handleShopDemandRoutes(request('/api/shops/demand', 'POST', { query: '青いガラスの一輪挿し', result_state: 'NONE' }), env, { readMember: async () => null });
  const third = await runShopDemandRematch(env);
  assert.deepEqual(third, { scanned: 1, matched: 0 });
  assert.notEqual(db.prepare(`SELECT last_checked_at FROM shop_demand_requests WHERE status='OPEN'`).get().last_checked_at, '');
  const demand = db.prepare(`SELECT * FROM shop_demand_requests WHERE status='OPEN'`).get();
  const outcome = await rematchDemand(env, demand, { search: async () => ({ exact: [{ name: 'x', url: 'https://www.amazon.co.jp/dp/B1', shop: { slug: 'find-fun', name: 'Find fun' }, matched: [], unmatched: [] }], near: [] }) });
  assert.equal(outcome.matched, true);
  assert.equal(outcome.notified, false, '未ログインの需要は通知先が無いので通知しない（MATCHED にはする）');
});

test('ジャンル・色・素材・サイズ・ブランドの絞り込みは検索文の条件と同じ扱いで、文なしでも探せる', async () => {
  const { db, env } = makeEnv();
  const params = new URLSearchParams({ genre: 'ファッション', subgenre: 'バッグ', color: 'blue', material: 'leather', size: 'A4' });
  const { shopFilters } = await import('../src/seller-shop.mjs');
  const conditions = filterConditions(shopFilters(params));
  assert.deepEqual(conditions.map((c) => [c.kind, c.label]), [['genre', 'バッグ'], ['color', '青'], ['material', '本革'], ['size', 'A4']]);
  const response = await handleShopDemandRoutes(request(`/api/shops/search?${params.toString()}`), env);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.conditions, ['バッグ', '青', '本革', 'A4']);
  assert.equal(payload.demand_query, 'バッグ 青 本革 A4');
  // ネイビーは「青」の別名ではないので近い商品、トートバッグはジャンル「バッグ」の語に含まれる
  assert.equal(payload.exact.length, 0);
  assert.equal(payload.near.length, 1);
  assert.deepEqual(payload.near[0].unmatched, ['青']);
  assert.equal(db.prepare(`SELECT query_text FROM shop_search_log`).get().query_text, 'バッグ 青 本革 A4');
  const brand = await handleShopDemandRoutes(request(`/api/shops/search?q=リュック&brand=ITG`), env);
  const withBrand = await brand.json();
  assert.equal(withBrand.exact.length, 1, 'ブランドは manufacturer 列でも判定する');
  const catalog = await (await handleShopDemandRoutes(request('/api/shops/filters'), env)).json();
  assert.ok(catalog.genres.length > 3 && catalog.colors.length > 5 && catalog.materials.length > 3);
});

// 2026-09-19 大隆さん指示（Seller収益化・需要マッチ改修 §8）: /for-sellers の「今、HOSHILUで探されています」は実データだけ。
// 同じ条件を 5 人以上が探している需要だけを、検索文ではなく正規化した条件で返す。5 人未満は個別に出さない。
test('公開ルート /api/shops/demand/public は 5 人以上の需要だけを条件で返し、検索文・個人情報を出さない', async () => {
  const { db, env } = makeEnv();
  const insert = db.prepare(`INSERT INTO shop_demand_requests(demand_id,demand_key,query_text,conditions_json,member_id,visitor_hash,seller_key,result_state,status,last_checked_at,matched_at,matched_seller_key,matched_shop_slug,matched_product_url,matched_level,notification_id,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,'',?7,'OPEN','','','','','','','',datetime('now'),datetime('now'))`);
  for (let i = 0; i < 5; i += 1) insert.run(`sd-a${i}`, 'k-tote', '黒 本革 A4 自立 トートバッグ 私のメール x@example.com', JSON.stringify(['黒', '本革', 'A4', 'トートバッグ']), '', `v${i}`, i < 4 ? 'NONE' : 'NEAR');
  for (let i = 0; i < 3; i += 1) insert.run(`sd-b${i}`, 'k-tumbler', '韓国限定 タンブラー', JSON.stringify(['韓国', 'タンブラー']), `m${i}`, `w${i}`, 'NONE');
  const response = await handleShopDemandRoutes(request('/api/shops/demand/public'), env);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.min_people, 5);
  assert.deepEqual(payload.items, [{ conditions: '黒・本革・A4・トートバッグ', people: 5, zero_results: 4, near_only: 1 }]);
  assert.ok(!JSON.stringify(payload).includes('x@example.com') && !JSON.stringify(payload).includes('私のメール'));
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
});
