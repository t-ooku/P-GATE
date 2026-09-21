// 2026-09-21 指示書 P2「匿名需要オファー」。
// ・価格は Seller の申告を信じない。取得済みの実測価格だけを使う
// ・知らせるのは、その価格が自分の希望価格に届いた人だけ
// ・Seller に誰が待っているかは渡さない。5人未満なら人数も出さない
// ・この経路は課金しない（DMC 50円の対象を広げない）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRICE_OFFER_EVENT_TYPE, reachedWishes, offerSummary, priceOfferResultUrl, handleSellerPriceOfferRoute
} from '../src/seller-price-offer.mjs';
import { safeDemandMatchResultUrl } from '../src/mywatch-routes.mjs';
import { URGENT_EVENT_TYPES } from '../src/today-hoshilu.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const wish = (member, id, target) => ({ member_id: member, wish_id: id, target_price_jpy: target });

test('希望価格に届いた人だけを対象にする', () => {
  const reached = reachedWishes([
    wish('m1', 'w1', 1500), wish('m2', 'w2', 1200), wish('m3', 'w3', 1000)
  ], 1200);
  assert.deepEqual(reached.map((row) => row.member_id), ['m1', 'm2'], '1000円希望の人には出さない');
});

test('価格が確認できていなければ誰にも出さない', () => {
  assert.deepEqual(reachedWishes([wish('m1', 'w1', 1500)], null), []);
  assert.deepEqual(reachedWishes([wish('m1', 'w1', 1500)], 0), []);
  assert.deepEqual(reachedWishes([wish('m1', 'w1', 1500)], '安い'), []);
});

test('希望価格が入っていない行は対象にしない', () => {
  assert.deepEqual(reachedWishes([wish('m1', 'w1', 0), wish('', 'w2', 1500)], 1200), []);
});

test('同じ人の同じ希望を二重に数えない', () => {
  const reached = reachedWishes([wish('m1', 'w1', 1500), wish('m1', 'w1', 1500)], 1200);
  assert.equal(reached.length, 1);
});

test('5人未満なら Seller に人数を出さない', () => {
  const few = offerSummary([wish('m1', 'w1', 1500), wish('m2', 'w2', 1500)]);
  assert.equal(few.below_threshold, true);
  assert.equal('notified_people' in few, false, '人数を出さない');
  const many = offerSummary(['a', 'b', 'c', 'd', 'e'].map((id) => wish(id, id, 1500)));
  assert.equal(many.below_threshold, false);
  assert.equal(many.notified_people, 5);
});

test('数えられないときは 0 人と言わない', () => {
  assert.deepEqual(offerSummary(null), { measurable: false });
});

test('通知の行き先は HOSHILU の Seller 商品ページ。署名は付けない', () => {
  const url = priceOfferResultUrl('itg-store', 'B0ABCDEFGH');
  assert.equal(url, 'https://hoshilu.app/shop/itg-store/product/B0ABCDEFGH');
  assert.ok(!url.includes('dm='), '課金用の署名を付けない');
  // 通知パネルの検査を通る（#406 と同じ穴を作らない）
  assert.equal(safeDemandMatchResultUrl(url), '/shop/itg-store/product/B0ABCDEFGH');
});

test('slug・ASIN の形が違えば行き先を作らない', () => {
  assert.equal(priceOfferResultUrl('', 'B0ABCDEFGH'), '');
  assert.equal(priceOfferResultUrl('itg', 'notanasin'), '');
});

test('通知パネルがこの種類のリンクを落とさない', () => {
  const source = read('src/mywatch-routes.mjs');
  assert.match(source, /const HOSHILU_LINK_EVENT_TYPES = new Set\(\[[^\]]*'PRICE_OFFER_MATCH'/u);
});

test('希望価格に届いた話なので即時に出す（§38）', () => {
  assert.ok(URGENT_EVENT_TYPES.includes(PRICE_OFFER_EVENT_TYPE));
});

// --- 課金を広げない ---
test('この経路は課金しない', () => {
  const source = read('src/seller-price-offer.mjs');
  assert.ok(!source.includes('seller_demand_match_clicks'), 'クリックを記録しない');
  assert.ok(!source.includes('demandMatchEligibility'), '残高・予算の判定をしない');
  assert.ok(!source.includes('recordDemandMatchClick'), '課金の経路に触れない');
  assert.match(source, /charged: false/u, '課金していないことを返す');
});

test('価格は Seller の申告を使わない', () => {
  const source = read('src/seller-price-offer.mjs');
  // 入力から読むのは ASIN だけ
  assert.match(source, /const asin = clean\(payload\?\.asin, 20\)/u);
  assert.ok(!/payload\?\.price/u.test(source), '申告価格を受け取らない');
  assert.match(source, /FROM sp_api_listings WHERE tenant=\?1 AND asin=\?2 AND price>0/u);
  assert.match(source, /FROM marketplace_offers WHERE tenant=\?1 AND asin=\?2 AND active=1 AND price>0/u);
});

test('買った後の逆ウォッチは対象にしない', () => {
  const source = read('src/seller-price-offer.mjs');
  assert.match(source, /'\$\.price_condition\.kind'\),'TARGET_PRICE'\)<>'POST_PURCHASE'/u);
});

// --- ルート ---
const seller = async () => ({ seller_key: 'k' });
const anonymous = async () => null;
const url = 'https://hoshilu.app/api/seller/price-offer';

test('他のルートは奪わない', async () => {
  assert.equal(await handleSellerPriceOfferRoute(new Request('https://hoshilu.app/api/search'), {}, seller), null);
});

test('GET は 405、未ログインは 401', async () => {
  assert.equal((await handleSellerPriceOfferRoute(new Request(url), {}, seller)).status, 405);
  const post = new Request(url, { method: 'POST', body: '{}' });
  assert.equal((await handleSellerPriceOfferRoute(post, {}, anonymous)).status, 401);
});

test('ASIN が無ければ 400', async () => {
  const env = { PRODUCT_DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
  const response = await handleSellerPriceOfferRoute(
    new Request(url, { method: 'POST', body: JSON.stringify({ asin: 'x' }) }), env, seller);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'ASIN_REQUIRED');
});

test('自分のショップに無い商品では手を挙げられない', async () => {
  const env = { PRODUCT_DB: { prepare: (sql) => ({
    bind: () => ({ first: async () => (/seller_billing_accounts/u.test(sql) ? { tenants: '["itg"]' } : null) })
  }) } };
  const response = await handleSellerPriceOfferRoute(
    new Request(url, { method: 'POST', body: JSON.stringify({ asin: 'B0ABCDEFGH' }) }), env, seller);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'PRODUCT_NOT_IN_YOUR_SHOP');
});

test('価格が確認できなければ通知せず、そう言う', async () => {
  const env = { PRODUCT_DB: { prepare: (sql) => ({
    bind: () => ({
      first: async () => {
        if (/seller_billing_accounts/u.test(sql)) return { tenants: '["itg"]' };
        if (/FROM products/u.test(sql)) return { product_name: '柔軟剤', image_url: '', asin: 'B0ABCDEFGH' };
        return null; // 価格は取れない
      },
      all: async () => ({ results: [] })
    })
  }) } };
  const response = await handleSellerPriceOfferRoute(
    new Request(url, { method: 'POST', body: JSON.stringify({ asin: 'B0ABCDEFGH' }) }), env, seller);
  const body = await response.json();
  assert.equal(body.measurable, false);
  assert.equal(body.reason, 'PRICE_NOT_CONFIRMED');
  assert.equal(body.charged, false);
});

test('Seller に個人情報を返さない', async () => {
  const notified = [];
  const env = { PRODUCT_DB: {
    prepare: (sql) => ({
      bind: (...values) => {
        if (/INSERT OR IGNORE INTO mywatch_notifications/u.test(sql)) notified.push(values);
        return {
          first: async () => {
            if (/seller_billing_accounts/u.test(sql)) return { tenants: '["itg"]' };
            if (/FROM products/u.test(sql)) return { product_name: '柔軟剤', image_url: '', asin: 'B0ABCDEFGH' };
            if (/sp_api_listings/u.test(sql)) return { price: 1200 };
            if (/seller_shops/u.test(sql)) return { slug: 'itg-store', shop_name: 'ITG STORE' };
            return null;
          },
          all: async () => ({ results: [
            { member_id: 'm1', wish_id: 'w1', target_price_jpy: 1500 },
            { member_id: 'm2', wish_id: 'w2', target_price_jpy: 900 }
          ] })
        };
      }
    }),
    batch: async (statements) => statements.map(() => ({ meta: { changes: 1 } }))
  } };
  const response = await handleSellerPriceOfferRoute(
    new Request(url, { method: 'POST', body: JSON.stringify({ asin: 'B0ABCDEFGH' }) }), env, seller);
  const body = await response.json();
  assert.equal(body.price_jpy, 1200);
  assert.equal(body.charged, false);
  assert.equal(body.below_threshold, true, '2人未満なので人数を出さない');
  const json = JSON.stringify(body);
  for (const key of ['member_id', 'wish_id', 'm1', 'm2']) assert.ok(!json.includes(key), key);
  assert.equal(notified.length, 1, '希望価格に届いた1人にだけ通知する');
});

test('index.mjs が配線している', () => {
  const index = read('src/index.mjs');
  assert.match(index, /import \{ handleSellerPriceOfferRoute \} from '\.\/seller-price-offer\.mjs';/u);
  assert.match(index, /const priceOfferResponse = await handleSellerPriceOfferRoute\(request, env\);/u);
});
