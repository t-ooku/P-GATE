import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  activeShops, handleSellerShopAdminRoutes, handleSellerShopRoutes, handleShopRoutes, publicShopRef, resetShopCache,
  shopForOffer, slugify, validateCouponInput, validateShopInput
} from '../src/seller-shop.mjs';

function d1(db) {
  return { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { const info = statement.run(...values); return { meta: { changes: Number(info.changes) } }; },
      async all() { return { results: statement.all(...values) }; },
      async first() { return statement.get(...values) ?? null; } }; } };
}
const SELLER_KEY = 'IGpFO0_7Xfi6mheMC2-HbGubdYIQPkGlda_gsSFmTKo';
function env({ plan = 'BUSINESS', status = 'ACTIVE' } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_product_search.sql', '0067_seller_billing_stripe.sql', '0069_seller_shops.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  db.exec(`CREATE TABLE growth_events (event_id TEXT PRIMARY KEY, event_type TEXT, locale TEXT, source TEXT, medium TEXT, campaign TEXT, content TEXT, marketplace TEXT, occurred_at TEXT, traffic_class TEXT)`);
  db.exec(`CREATE TABLE sp_api_listings (tenant TEXT, merchant_id TEXT, seller_sku TEXT, asin TEXT, product_name TEXT, image_url TEXT, buyable INTEGER, price REAL, product_url TEXT, updated_at TEXT)`);
  db.prepare(`INSERT INTO seller_billing_accounts(seller_key,account_name,contact_email,tenants,plan,payment_preference,status,created_at,updated_at)
    VALUES(?1,'ITG GROUP','a@example.com','["itg"]',?2,'CARD',?3,'2026-09-04T00:00:00Z','2026-09-04T00:00:00Z')`).run(SELLER_KEY, plan, status);
  db.prepare(`INSERT INTO products(tenant,record_key,asin,sku,product_name,manufacturer,image_url,stock,amazon_jp_url,amazon_us_url,search_aliases,localized_content,row_hash,imported_at)
    VALUES('itg','r1','B000000001','sku1','自立する本革トートバッグ','ITG','https://img.example/1.jpg',3,'https://www.amazon.co.jp/dp/B000000001','','','','h','2026-09-01T00:00:00Z')`).run();
  db.prepare(`INSERT INTO products(tenant,record_key,asin,sku,product_name,manufacturer,image_url,stock,amazon_jp_url,amazon_us_url,search_aliases,localized_content,row_hash,imported_at)
    VALUES('itg','r2','B000000002','sku2','在庫なし商品','ITG','https://img.example/2.jpg',0,'https://www.amazon.co.jp/dp/B000000002','','','','h','2026-09-01T00:00:00Z')`).run();
  resetShopCache();
  return { db, env: { PRODUCT_DB: d1(db), LINK_SIGNING_SECRET: 's'.repeat(64) } };
}
const request = (path, method = 'GET', body = null, headers = {}) => new Request(`https://hoshilu.app${path}`, {
  method, headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app', ...headers }, body: body ? JSON.stringify(body) : undefined
});
const seller = { seller_key: SELLER_KEY, account: 'ITG', tenants: ['itg'], plan: 'BUSINESS' };
const fakeToken = async (payload) => `tok.${payload.a}`;

test('slug と入力検証', () => {
  assert.equal(slugify('With Care!! 2026'), 'with-care-2026');
  assert.equal(validateShopInput({ shop_name: 'with care' }).slug, 'with-care');
  assert.throws(() => validateShopInput({ shop_name: '' }), /SHOP_NAME_REQUIRED/u);
  assert.throws(() => validateShopInput({ shop_name: 'x', slug: 'admin' }), /SHOP_SLUG_RESERVED/u);
  assert.equal(validateShopInput({ shop_name: 'x', slug: 'ok-shop', logo_url: 'http://insecure.example/logo.png' }).logo_url, '');
  assert.equal(validateCouponInput({ title: '初回10%OFF', marketplace: 'amazon_jp', hoshilu_only: false }).hoshilu_only, 0);
  assert.throws(() => validateCouponInput({ title: 'x', marketplace: 'EBAY' }), /COUPON_MARKETPLACE_INVALID/u);
  // 制御文字は落とし、ハイフンは残す（パッチ運搬で正規表現が崩れた場合の回帰テスト）
  assert.equal(validateShopInput({ shop_name: `rom-and${String.fromCharCode(1)} x${String.fromCharCode(127)}` }).shop_name, 'rom-and x');
  assert.equal(validateShopInput({ shop_name: 'x', intro: `1行目${String.fromCharCode(7)}\n2行目` }).intro, '1行目\n2行目');
});

test('Business だけがショップを作れ、公開ページ・検索結果付与・クーポン・フォローが動く', async () => {
  const { env: e, db } = env();
  // 未作成のときは entitled:true / shop:null
  const empty = await (await handleSellerShopRoutes(request('/api/seller/shop'), e, seller)).json();
  assert.equal(empty.entitled, true);
  assert.equal(empty.shop, null);
  // 作成
  const created = await handleSellerShopRoutes(request('/api/seller/shop', 'PUT', {
    shop_name: 'with care', tagline: '毎日使うものを、少し良く。', intro: 'ITG GROUP のショップです。\n発送は翌営業日。', logo_url: 'https://img.example/logo.png'
  }), e, seller);
  assert.equal(created.status, 200);
  const createdBody = await created.json();
  assert.equal(createdBody.shop.url, '/shop/with-care');
  // クーポン
  const coupon = await handleSellerShopRoutes(request('/api/seller/shop/coupons', 'POST', {
    title: '初回10%OFF', discount_text: '10%OFF', code: 'HOSHILU10', marketplace: 'AMAZON_JP', landing_url: 'https://www.amazon.co.jp/promo/x', ends_at: '2099-12-31'
  }), e, seller);
  const couponBody = await coupon.json();
  assert.equal(couponBody.coupons.length, 1);
  assert.equal(couponBody.coupons[0].live, true);
  // 検索結果への付与（tenant 一致 / seller_id 一致）
  const shops = await activeShops(e, { now: Date.now() + 120000 });
  assert.equal(shops.length, 1);
  assert.deepEqual(publicShopRef(shopForOffer(shops, { tenant: 'itg' })), { slug: 'with-care', name: 'with care', coupon: true });
  assert.equal(shopForOffer(shops, { tenant: 'mc2' }), null);
  // 公開ページ
  const page = await handleShopRoutes(request('/shop/with-care'), e, { createTrackToken: fakeToken, readMember: async () => null, hashUser: async () => 'h' });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /with care/u);
  assert.match(html, /自立する本革トートバッグ/u);
  assert.doesNotMatch(html, /在庫なし商品/u);
  // 2026-09-05 夜: 商品リンクはモールへ直接（真っ白対策）。/go は data-track のビーコンだけ。
  assert.match(html, /<a class="shop-product"[^>]*href="https:\/\/www\.amazon\.co\.jp\/dp\/B000000001[^"]*"[^>]*data-track="[^"]*\/go\?token=tok\.B000000001"/u);
  assert.doesNotMatch(html, /class="shop-product"[^>]*target="_blank"/u);
  assert.match(html, /☰ 詳細検索/u);
  assert.match(html, /並び順/u);
  assert.match(html, /HOSHILU10/u);
  assert.match(html, /☆ ショップをホシる/u);
  assert.doesNotMatch(html, new RegExp(SELLER_KEY, 'u'));
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM growth_events WHERE event_type='shop_viewed' AND campaign='with-care'`).get().c, 1);
  // クーポン遷移
  const jump = await handleShopRoutes(request(`/shop/with-care/coupon/${couponBody.coupon_id}`), e, {});
  assert.equal(jump.status, 302);
  assert.equal(jump.headers.get('location'), 'https://www.amazon.co.jp/promo/x');
  // フォロー: 未ログイン 401 → ログインで追加 → 解除
  const guest = await handleShopRoutes(request('/api/member/shops/with-care/follow', 'POST', {}), e, { readMember: async () => null });
  assert.equal(guest.status, 401);
  const member = { readMember: async () => ({ id: 'member-1' }) };
  const followed = await (await handleShopRoutes(request('/api/member/shops/with-care/follow', 'POST', {}), e, member)).json();
  assert.deepEqual({ following: followed.following, followers: followed.followers }, { following: true, followers: 1 });
  const again = await (await handleShopRoutes(request('/api/member/shops/with-care/follow', 'POST', {}), e, member)).json();
  assert.equal(again.followers, 1);
  const pageAsMember = await (await handleShopRoutes(request('/shop/with-care'), e, { createTrackToken: fakeToken, ...member, hashUser: async () => 'h' })).text();
  assert.match(pageAsMember, /★ ホシってます/u);
  const unfollowed = await (await handleShopRoutes(request('/api/member/shops/with-care/follow', 'DELETE', {}), e, member)).json();
  assert.equal(unfollowed.followers, 0);
  // KPI
  const summary = await (await handleSellerShopRoutes(request('/api/seller/shop'), e, seller)).json();
  assert.equal(summary.kpi.views_30d, 2);
  // 非公開にするとページもショップ付与も消える
  await handleSellerShopRoutes(request('/api/seller/shop', 'PUT', { shop_name: 'with care', slug: 'with-care', status: 'HIDDEN' }), e, seller);
  assert.equal((await handleShopRoutes(request('/shop/with-care'), e, {})).status, 404);
  assert.equal((await activeShops(e, { now: Date.now() + 240000 })).length, 0);
  // 別セラーは同じ slug を取れない
  db.prepare(`INSERT INTO seller_billing_accounts(seller_key,account_name,contact_email,tenants,plan,payment_preference,status,created_at,updated_at)
    VALUES('other_seller_key_0000000000000000000000000','Other','b@example.com','["mc2"]','BUSINESS','CARD','ACTIVE','2026-09-04T00:00:00Z','2026-09-04T00:00:00Z')`).run();
  const clash = await handleSellerShopRoutes(request('/api/seller/shop', 'PUT', { shop_name: 'Other', slug: 'with-care' }), e, { seller_key: 'other_seller_key_0000000000000000000000000' });
  assert.equal((await clash.json()).error, 'SHOP_SLUG_TAKEN');
});

test('無料プランは 402、クロスオリジンの投稿は 403、管理者代行APIは同じ処理を seller_key 指定で通す', async () => {
  const free = env({ plan: 'SELLER' });
  const denied = await handleSellerShopRoutes(request('/api/seller/shop', 'PUT', { shop_name: 'x' }), free.env, seller);
  assert.equal(denied.status, 402);
  assert.equal((await denied.json()).error, 'BUSINESS_PLAN_REQUIRED');
  const summary = await (await handleSellerShopRoutes(request('/api/seller/shop'), free.env, seller)).json();
  assert.equal(summary.entitled, false);

  const { env: e } = env();
  const cross = await handleShopRoutes(request('/api/member/shops/x/follow', 'POST', {}, { origin: 'https://evil.example' }), e, {});
  assert.equal(cross.status, 403);
  const unauthorized = await handleSellerShopAdminRoutes(request(`/api/admin/seller-shops/${SELLER_KEY}`, 'PUT', { shop_name: 'with care' }), e, async () => false);
  assert.equal(unauthorized.status, 401);
  const admin = await handleSellerShopAdminRoutes(request(`/api/admin/seller-shops/${SELLER_KEY}`, 'PUT', { shop_name: 'with care' }), e, async () => true);
  assert.equal((await admin.json()).shop.url, '/shop/with-care');
  const list = await (await handleSellerShopAdminRoutes(request('/api/admin/seller-shops'), e, async () => true)).json();
  assert.equal(list.shops.length, 1);
  assert.equal(await handleShopRoutes(request('/shop/'), e, {}), null);
});

test('セラー画面とトップの資材にショップ導線がある', () => {
  const page = readFileSync(new URL('../src/seller-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /id="sellerShopForm"/u);
  assert.match(page, /id="sellerCouponForm"/u);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /shopLinkElement\(candidate/u);
  assert.equal(app, readFileSync(new URL('../public/assets-v147/app.js', import.meta.url), 'utf8'));
  assert.match(readFileSync(new URL('../public/seller.js', import.meta.url), 'utf8'), /\/api\/seller\/shop\/coupons/u);
});
