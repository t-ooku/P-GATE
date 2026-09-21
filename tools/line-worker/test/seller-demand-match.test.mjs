import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  demandMatchProductUrl, demandMatchSummary, handleSellerDemandMatchRoutes, recordDemandMatchClick,
  signDemandMatchToken, verifyDemandMatchToken
} from '../src/seller-demand-match.mjs';
import { registerDemandOffer, rematchDemand } from '../src/shop-demand.mjs';
import { handleShopRoutes, resetShopCache } from '../src/seller-shop.mjs';

// 2026-09-19 §2〜§4・§10〜§14 の経路はそのまま:
//   検索 → 0件 → ホシっとく → Seller が需要に商品登録 → 再照合 → HOSHILU が本人へ通知 →
//   本人が通知から Seller 商品ページを開く
// 2026-09-21 大隆さん決定「クリック課金をやめる。料金は月額だけ。計測は残す」:
//   この最後の一歩に **お金を動かさない**。件数だけ数える。bot/本人/管理者/重複は除外し、理由は残す。
//   残高・予算で需要マッチを止めることもしない（課金しないなら止める理由が無い）。

function d1(db) {
  const statementFor = (sql) => { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { const info = statement.run(...values); return { meta: { changes: Number(info.changes) } }; },
      async all() { return { results: statement.all(...values) }; },
      async first() { return statement.get(...values) ?? null; } }; };
  return { prepare: statementFor, async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; } };
}
const SELLER_KEY = 'IGpFO0_7Xfi6mheMC2-HbGubdYIQPkGlda_gsSFmTKo';
const SECRET = 'demand-match-test-secret-0123456789abcdef';
function makeEnv(extra = {}) {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_product_search.sql', '0048_seller_priority_console.sql', '0067_seller_billing_stripe.sql', '0069_seller_shops.sql', '0078_seller_shop_business_identity.sql', '0079_shop_demand.sql', '0081_seller_demand_match.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  db.exec(`CREATE TABLE sp_api_listings (tenant TEXT, merchant_id TEXT, seller_sku TEXT, asin TEXT, product_name TEXT, image_url TEXT, buyable INTEGER, price REAL, product_url TEXT, updated_at TEXT, observed_at TEXT)`);
  db.exec(`CREATE TABLE marketplace_offers (tenant TEXT, asin TEXT, record_key TEXT, marketplace TEXT, seller_id TEXT, product_url TEXT, price REAL, stock_status TEXT, active INTEGER, observed_at TEXT)`);
  db.exec(`CREATE TABLE mywatch_notifications (notification_id TEXT PRIMARY KEY, member_id TEXT, wish_id TEXT, event_key TEXT, event_type TEXT, channel TEXT, title TEXT, body TEXT, status TEXT, attempts INTEGER, next_attempt_at TEXT, delivered_at TEXT, read_at TEXT, dismissed_at TEXT, last_error_code TEXT DEFAULT '', created_at TEXT, updated_at TEXT, asin TEXT DEFAULT '', marketplace TEXT DEFAULT '', image_url TEXT DEFAULT '', result_url TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE member_notification_destinations (member_id TEXT, channel TEXT, encrypted_destination TEXT, verified_at TEXT)`);
  db.exec(`CREATE TABLE growth_events (event_id TEXT PRIMARY KEY, event_type TEXT, locale TEXT, source TEXT, medium TEXT, campaign TEXT, content TEXT, marketplace TEXT, occurred_at TEXT, traffic_class TEXT)`);
  db.prepare(`INSERT INTO seller_billing_accounts(seller_key,account_name,contact_email,tenants,plan,payment_preference,status,created_at,updated_at)
    VALUES(?1,'ITG GROUP','a@example.com','["itg"]','BUSINESS','CARD','ACTIVE','2026-09-04T00:00:00Z','2026-09-04T00:00:00Z')`).run(SELLER_KEY);
  db.prepare(`INSERT INTO seller_shops(seller_key,slug,shop_name,tagline,intro,logo_url,cover_url,website_url,tenants,seller_ids,status,created_at,updated_at)
    VALUES(?1,'find-fun','Find fun','','','','','','["itg"]','[]','ACTIVE','2026-09-04T00:00:00Z','2026-09-04T00:00:00Z')`).run(SELLER_KEY);
  db.prepare(`INSERT INTO products(tenant,record_key,asin,sku,product_name,manufacturer,image_url,stock,amazon_jp_url,amazon_us_url,search_aliases,localized_content,row_hash,imported_at)
    VALUES('itg','r1','B000000001','r1','自立する本革トートバッグ ブラック A4','ITG','https://img.example/r1.jpg',3,'https://www.amazon.co.jp/dp/B000000001','','','','r1','2026-09-01T00:00:00Z')`).run();
  // 探し中需要（会員 m1 が「黒の本革で自立するA4トートバッグ」を 0件でホシっといた）
  db.prepare(`INSERT INTO shop_demand_requests(demand_id,demand_key,query_text,conditions_json,member_id,visitor_hash,seller_key,result_state,status,created_at,updated_at)
    VALUES('sd-1','黒の本革で自立するa4トートバッグ','黒の本革で自立するA4トートバッグ','["黒","本革","A4","自立","トートバッグ"]','m1','v1','','NONE','OPEN','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z')`).run();
  resetShopCache();
  return { db, env: { PRODUCT_DB: d1(db), MEMBER_SESSION_SECRET: SECRET, LINK_SIGNING_SECRET: SECRET, AMAZON_ASSOCIATE_TAG: 'hoshilu00-22', ...extra } };
}
const request = (path, { method = 'GET', ua = 'Mozilla/5.0 (iPhone) Safari', body = null } = {}) => new Request(`https://hoshilu.app${path}`, {
  method, headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app', 'user-agent': ua }, body: body ? JSON.stringify(body) : undefined
});
const NOW = new Date('2026-09-19T03:00:00Z');

test('署名付きリンク: 需要・商品・本人・Seller を含み、改ざんと期限切れは受け付けない', async () => {
  const { env } = makeEnv();
  const url = await demandMatchProductUrl(env, { slug: 'find-fun', asin: 'B000000001', demandId: 'sd-1', memberId: 'm1', sellerKey: SELLER_KEY });
  assert.match(url, /^https:\/\/hoshilu\.app\/shop\/find-fun\/product\/B000000001\?dm=/u);
  const token = new URL(url).searchParams.get('dm');
  const claim = await verifyDemandMatchToken(env, token);
  assert.equal(claim.demand_id, 'sd-1'); assert.equal(claim.asin, 'B000000001'); assert.equal(claim.seller_key, SELLER_KEY);
  assert.equal(claim.member_hash.length, 32, '会員IDそのものは URL に入れない');
  assert.equal(await verifyDemandMatchToken(env, `${token}x`), null);
  assert.equal(await verifyDemandMatchToken(env, token, Math.floor(Date.now() / 1000) + 86400 * 31), null, '30日で失効');
  await assert.rejects(signDemandMatchToken({ PRODUCT_DB: env.PRODUCT_DB }, { demandId: 'sd-1', asin: 'B000000001', memberId: 'm1', sellerKey: SELLER_KEY }), /DEMAND_MATCH_SECRET_REQUIRED/u);
});

test('需要に商品を登録 → 通知のリンクは Seller 専用商品ページ（署名付き）になる', async () => {
  const { db, env } = makeEnv();
  const result = await registerDemandOffer(env, SELLER_KEY, { demand_key: '黒の本革で自立するa4トートバッグ', asin: 'B000000001' }, { now: NOW.toISOString() });
  assert.equal(result.level, 'EXACT'); assert.equal(result.notified, 1);
  const notification = db.prepare(`SELECT result_url FROM mywatch_notifications WHERE member_id='m1' AND channel='WEB'`).get();
  assert.match(notification.result_url, /^https:\/\/hoshilu\.app\/shop\/find-fun\/product\/B000000001\?dm=/u);
  const demand = { ...db.prepare(`SELECT status,matched_seller_key FROM shop_demand_requests WHERE demand_id='sd-1'`).get() };
  assert.deepEqual(demand, { status: 'MATCHED', matched_seller_key: SELLER_KEY });
});

async function matchedEnv(extra = {}) {
  const made = makeEnv(extra);
  await registerDemandOffer(made.env, SELLER_KEY, { demand_key: '黒の本革で自立するa4トートバッグ', asin: 'B000000001' }, { now: NOW.toISOString() });
  const token = new URL(made.db.prepare(`SELECT result_url FROM mywatch_notifications WHERE member_id='m1' AND channel='WEB'`).get().result_url).searchParams.get('dm');
  return { ...made, token };
}

test('有効クリック: 本人が通知から開いた時だけ VALID。金額は動かさない。同じ日の重複は DUPLICATE', async () => {
  const { db, env, token } = await matchedEnv();
  const click = await recordDemandMatchClick(env, { token, request: request('/x'), memberId: 'm1', productUrl: 'https://www.amazon.co.jp/dp/B000000001', now: NOW });
  assert.equal(click.recorded, true); assert.equal(click.status, 'VALID');
  assert.equal(click.charged, false, '課金しない');
  assert.equal(click.amount_jpy, 0, '1円も動かさない');
  const again = await recordDemandMatchClick(env, { token, request: request('/x'), memberId: 'm1', now: NOW });
  assert.equal(again.recorded, false); assert.equal(again.reason, 'DUPLICATE');
  const rows = db.prepare(`SELECT status,reason,amount_jpy,jst_month,source_event_id FROM seller_demand_match_clicks`).all().map((row) => ({ ...row }));
  assert.deepEqual(rows, [{ status: 'VALID', reason: '', amount_jpy: 0, jst_month: '2026-09', source_event_id: 'dm:sd-1:B000000001:2026-09-19' }]);
  // 請求台帳には何も足さない
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM seller_billing_ledger`).get().c, 0);
  const summary = await demandMatchSummary(env, SELLER_KEY, NOW);
  assert.equal(summary.notified, 1); assert.equal(summary.valid_clicks, 1);
  assert.equal(summary.charged, false);
  // 金額・予算の語を集計に残さない（画面が値段を書けないようにする）
  for (const key of ['amount_jpy', 'cap_jpy', 'unit_jpy', 'eligibility']) assert.equal(key in summary, false, key);
});

test('除外: bot・未ログイン・別の会員・Seller 本人・管理者は EXCLUDED として理由付きで残り、0円', async () => {
  const cases = [
    ['BOT', { request: request('/x', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), memberId: 'm1' }],
    ['BOT', { request: request('/x', { method: 'HEAD' }), memberId: 'm1' }],
    ['NOT_LOGGED_IN', { request: request('/x'), memberId: '' }],
    ['MEMBER_MISMATCH', { request: request('/x'), memberId: 'm2' }],
    ['SELF', { request: request('/x'), memberId: 'm1', viewerSellerKey: SELLER_KEY }],
    ['ADMIN', { request: request('/x'), memberId: 'm1', viewerIsAdmin: true }]
  ];
  for (const [reason, input] of cases) {
    const { db, env, token } = await matchedEnv();
    const click = await recordDemandMatchClick(env, { token, ...input, now: NOW });
    assert.equal(click.status, 'EXCLUDED', reason); assert.equal(click.reason, reason); assert.equal(click.amount_jpy, 0);
    assert.equal(click.charged, false);
    assert.equal(db.prepare(`SELECT amount_jpy FROM seller_demand_match_clicks`).get().amount_jpy, 0);
    assert.equal((await demandMatchSummary(env, SELLER_KEY, NOW)).excluded_clicks, 1);
  }
});

// 2026-09-21: 予算上限・前払い残高からの消化・課金フラグのテストは、その機能ごと無くなったので削除した。
// 代わりに「もう課金の経路に触れていない」ことをソースで固定する。
test('課金の経路にもう触れていない', () => {
  const source = readFileSync(new URL('../src/seller-demand-match.mjs', import.meta.url), 'utf8');
  for (const gone of ['chargeReferralFromWallet', 'getWallet', 'DEMAND_MATCH_CLICK_JPY', 'seller_demand_match_budgets', 'DEMAND_MATCH_CHARGE_ENABLED']) {
    assert.ok(!source.includes(gone), gone);
  }
  assert.match(source, /charged: false/u);
  const demand = readFileSync(new URL('../src/shop-demand.mjs', import.meta.url), 'utf8');
  assert.ok(!demand.includes('demandMatchEligibility'), '残高・予算で需要マッチを止めない');
});

test('商品ページ /shop/<slug>/product/<asin>: 商品データの事実だけ。?dm= 付きで本人が開くと条件と一致項目を表示し、クリックを記録', async () => {
  const { db, env, token } = await matchedEnv();
  const fakeToken = async (payload) => `tok-${payload.a}`;
  const opts = { createTrackToken: fakeToken, hashUser: async () => 'h', readSeller: async () => null, isAdmin: async () => false };
  const plain = await handleShopRoutes(request('/shop/find-fun/product/B000000001'), env, { ...opts, readMember: async () => null });
  assert.equal(plain.status, 200);
  const html = await plain.text();
  assert.match(html, /自立する本革トートバッグ ブラック A4/u);
  assert.match(html, /href="https:\/\/www\.amazon\.co\.jp\/dp\/B000000001\?tag=hoshilu00-22"/u, '外部購入先はデータの URL に紐付けタグを足すだけ');
  assert.match(html, /data-track="https:\/\/hoshilu\.app\/go\?token=tok-B000000001"/u);
  assert.match(html, /href="\/shop\/find-fun"/u, 'ショップへ');
  assert.match(html, /ホシっとく/u);
  assert.match(html, /価格・在庫は購入先でご確認ください/u, '価格データが無い商品に価格を作らない');
  assert.doesNotMatch(html, /あなたが探していたもの/u);
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM seller_demand_match_clicks`).get().c, 0, '通常アクセスでは課金判定の行を作らない');
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM growth_events WHERE event_type='shop_product_viewed' AND campaign='find-fun' AND content='B000000001'`).get().c, 1);

  const own = await handleShopRoutes(request(`/shop/find-fun/product/B000000001?dm=${encodeURIComponent(token)}`), env, { ...opts, readMember: async () => ({ id: 'm1' }) });
  const ownHtml = await own.text();
  assert.match(ownHtml, /あなたが探していたもの/u);
  assert.match(ownHtml, /「黒の本革で自立するA4トートバッグ」/u);
  assert.match(ownHtml, /✓ 黒.*✓ 本革.*✓ A4.*✓ 自立.*✓ トートバッグ/su);
  assert.match(ownHtml, /条件に一致/u);
  const row = db.prepare(`SELECT status,reason,member_hash FROM seller_demand_match_clicks`).get();
  assert.deepEqual([row.status, row.reason], ['VALID', '']);
  assert.notEqual(row.member_hash, 'm1');
  assert.equal(db.prepare(`SELECT content FROM growth_events WHERE event_type='demand_match_click'`).get().content, 'VALID:');

  // 別の会員が同じリンクを開いても、需要の本人の検索文は出さない
  const other = await handleShopRoutes(request(`/shop/find-fun/product/B000000001?dm=${encodeURIComponent(token)}`), env, { ...opts, readMember: async () => ({ id: 'm9' }) });
  assert.doesNotMatch(await other.text(), /黒の本革で自立するA4トートバッグ/u);
  // Seller 本人が開いた（署名は同じ日で DUPLICATE 扱いになる前に別日で確認）
  const self = await handleShopRoutes(request(`/shop/find-fun/product/B000000001?dm=${encodeURIComponent(token)}`), env, { ...opts, readSeller: async () => ({ seller_key: SELLER_KEY }), readMember: async () => ({ id: 'm1' }) });
  assert.equal(self.status, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM seller_demand_match_clicks WHERE status='VALID'`).get().c, 1, 'VALID は 1 件のまま');
  const missing = await handleShopRoutes(request('/shop/find-fun/product/B000000009'), env, { ...opts, readMember: async () => null });
  assert.equal(missing.status, 404, '商品データに無い ASIN のページは作らない');
});

test('/api/seller/demand-match: 集計だけ。予算の設定経路は無くした', async () => {
  const { env } = await matchedEnv();
  const seller = { seller_key: SELLER_KEY };
  const unauthorized = await handleSellerDemandMatchRoutes(request('/api/seller/demand-match'), env, null);
  assert.equal(unauthorized.status, 401);
  const summary = await (await handleSellerDemandMatchRoutes(request('/api/seller/demand-match'), env, seller)).json();
  assert.equal(summary.ok, true);
  assert.equal(summary.demand_match.charged, false);
  // 予算を設定する経路は消えている（404）
  const budget = await handleSellerDemandMatchRoutes(request('/api/seller/demand-match/budget', { method: 'PUT', body: { monthly_cap_jpy: 20000 } }), env, seller);
  assert.equal(budget.status, 404);
  const page = readFileSync(new URL('../src/seller-page.mjs', import.meta.url), 'utf8');
  for (const label of ['data-dm-kpi="notified"', 'data-dm-kpi="valid"', 'data-dm-kpi="excluded"', 'seller.js?v=5']) assert.ok(page.includes(label), label);
  for (const gone of ['data-dm-kpi="amount"', 'data-dm-kpi="cap"', 'sellerDemandMatchBudgetForm']) assert.ok(!page.includes(gone), gone);
  const js = readFileSync(new URL('../public/seller.js', import.meta.url), 'utf8');
  assert.ok(!js.includes('/api/seller/demand-match/budget'), '画面からも予算の保存を消す');
  assert.ok(!js.includes('DEMAND_MATCH_BALANCE_REQUIRED'), '残高不足で断る文言を残さない');
  const auth = readFileSync(new URL('../src/seller-auth.mjs', import.meta.url), 'utf8');
  assert.match(auth, /handleSellerDemandMatchRoutes/u);
});

// 2026-09-21 大隆さん決定: 残高が無い Seller の需要マッチを止めるのをやめた。
// 課金しないのだから、止める理由が無い。止めていた分だけ会員が商品に出会えなかった。
test('残高が無くても需要マッチは止めない: 商品登録も再照合の通知も通る', async () => {
  {
    const { db, env } = makeEnv();
    const result = await registerDemandOffer(env, SELLER_KEY, { demand_key: '黒の本革で自立するa4トートバッグ', asin: 'B000000001' }, { now: NOW.toISOString() });
    assert.equal(result.notified, 1, '残高ゼロでも本人に届く');
    assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM shop_demand_offers`).get().c, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM seller_billing_ledger`).get().c, 0, 'お金は動かない');
  }
  {
    const { db, env } = makeEnv();
    const demand = db.prepare(`SELECT * FROM shop_demand_requests WHERE demand_id='sd-1'`).get();
    const outcome = await rematchDemand(env, demand, { now: NOW.toISOString() });
    assert.equal(outcome.matched, true);
    assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM mywatch_notifications`).get().c, 1);
  }
});
test('公開している料金は月額だけ。クリックの値段を掲げない', () => {
  const lp = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  assert.match(lp, /追加料金 <strong>なし<\/strong>/u);
  assert.ok(!/1有効クリック 50円/u.test(lp), '値段として 50円 を出さない');
  const outreach = readFileSync(new URL('../src/seller-outreach.mjs', import.meta.url), 'utf8');
  assert.ok(!outreach.includes('1有効クリック50円'), '声かけの文面にも残さない');
  const seo = readFileSync(new URL('../src/seo-pages-2026-09-06-seller.mjs', import.meta.url), 'utf8');
  assert.ok(!seo.includes('1有効クリック50円'), 'FAQ にも残さない');
});
