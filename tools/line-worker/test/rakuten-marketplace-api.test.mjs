import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRakutenItems,
  RAKUTEN_REQUEST_TIMEOUT_MS,
  rakutenApiConfigured,
  searchRakutenMarketplace,
  searchRakutenMarketplaceWithFallback
} from '../src/rakuten-marketplace-api.mjs';

const env = { RAKUTEN_APPLICATION_ID: 'app-id', RAKUTEN_ACCESS_KEY: 'access-key', RAKUTEN_AFFILIATE_ID: 'affiliate-id' };

test('楽天APIの応答上限は公開検索の15秒枠内で移行後の遅延を許容する', () => {
  assert.equal(RAKUTEN_REQUEST_TIMEOUT_MS, 7000);
  assert.ok(RAKUTEN_REQUEST_TIMEOUT_MS < 15000);
});

test('楽天市場APIはApplication IDとAccess Keyの両方を必須にする', () => {
  assert.equal(rakutenApiConfigured(env), true);
  assert.equal(rakutenApiConfigured({ RAKUTEN_APPLICATION_ID: 'app-id' }), false);
});

test('楽天市場の商品詳細URLをHOSHILUの出品情報へ正規化する', () => {
  const candidates = normalizeRakutenItems({ items: [{
    itemName: 'スマホ対応ミニフォトプリンター', itemCode: 'shop:item-1', itemPrice: 5980,
    itemUrl: 'https://item.rakuten.co.jp/shop/item-1/', availability: 1,
    mediumImageUrls: [{ imageUrl: 'https://thumbnail.image.rakuten.co.jp/image.jpg' }]
  }] });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].offers[0].marketplace, 'RAKUTEN_JP');
  assert.equal(candidates[0].offers[0].product_url, 'https://item.rakuten.co.jp/shop/item-1/');
  assert.equal(candidates[0].offers[0].stock_status, 'IN_STOCK');
});

test('楽天公式APIの複数画像URLを重複なく保持する', () => {
  const [candidate] = normalizeRakutenItems({ items: [{
    itemName: '複数画像の商品', itemCode: 'shop:multi', itemPrice: 5980,
    itemUrl: 'https://item.rakuten.co.jp/shop/multi/',
    mediumImageUrls: [
      { imageUrl: 'https://thumbnail.image.rakuten.co.jp/main.jpg' },
      { imageUrl: 'https://thumbnail.image.rakuten.co.jp/second.jpg' }
    ],
    smallImageUrls: [{ imageUrl: 'https://thumbnail.image.rakuten.co.jp/main.jpg' }]
  }] });
  assert.deepEqual(candidate.image_urls, [
    'https://thumbnail.image.rakuten.co.jp/main.jpg',
    'https://thumbnail.image.rakuten.co.jp/second.jpg'
  ]);
});

test('楽天は公式送料込みフラグがある商品だけ送料0の比較価格にする', () => {
  const candidates = normalizeRakutenItems({ items: [{
    itemName:'送料無料の商品',itemCode:'shop:free',itemPrice:5980,postageFlag:0,
    itemUrl:'https://item.rakuten.co.jp/shop/free/'
  },{
    itemName:'送料別の商品',itemCode:'shop:paid',itemPrice:4980,postageFlag:1,
    itemUrl:'https://item.rakuten.co.jp/shop/paid/'
  }] });
  assert.equal(candidates[0].offers[0].shipping_fee,0);
  assert.equal(candidates[0].offers[0].total_cost,5980);
  assert.equal(candidates[0].offers[0].shipping_fee_confirmed,true);
  assert.equal(candidates[1].offers[0].shipping_fee_confirmed,false);
  assert.equal(candidates[1].offers[0].total_cost,0);
});

test('楽天公式affiliateUrlを通常商品URLより優先する', () => {
  const affiliateUrl = 'https://hb.afl.rakuten.co.jp/hgc/abc123/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fitem-1%2F&m=https%3A%2F%2Fm.rakuten.co.jp%2Fshop%2Fi%2F1';
  const candidates = normalizeRakutenItems({ items: [{
    itemName: 'スマホ対応ミニフォトプリンター',
    itemCode: 'shop:item-1',
    itemPrice: 5980,
    itemUrl: 'https://item.rakuten.co.jp/shop/item-1/',
    affiliateUrl,
    availability: 1
  }] });
  assert.equal(candidates[0].offers[0].product_url, affiliateUrl);
});

test('不正なaffiliateUrlは捨てて通常商品URLへ戻す', () => {
  const candidates = normalizeRakutenItems({ items: [{
    itemName: 'スマホ対応ミニフォトプリンター',
    itemCode: 'shop:item-1',
    itemUrl: 'https://item.rakuten.co.jp/shop/item-1/',
    affiliateUrl: 'https://hb.afl.rakuten.co.jp/hgc/abc123/?pc=https%3A%2F%2Fevil.example%2Fsteal'
  }] });
  assert.equal(
    candidates[0].offers[0].product_url,
    'https://item.rakuten.co.jp/shop/item-1/'
  );
});

test('楽天市場APIへ整理済み検索語とサーバー側認証情報を渡す', async () => {
  let requested;
  const candidates = await searchRakutenMarketplace(env, '小型 写真プリンター', async (url, options) => {
    requested = { url: new URL(url), options };
    return Response.json({ items: [{ itemName: '写真プリンター', itemCode: 'shop:item', itemPrice: 5000, itemUrl: 'https://item.rakuten.co.jp/shop/item/' }] });
  });
  assert.equal(requested.url.hostname, 'openapi.rakuten.co.jp');
  assert.equal(requested.url.searchParams.get('applicationId'), 'app-id');
  assert.equal(requested.url.searchParams.get('accessKey'), 'access-key');
  assert.equal(requested.url.searchParams.get('affiliateId'), 'affiliate-id');
  assert.equal(requested.url.searchParams.get('keyword'), '小型 写真プリンター');
  assert.match(requested.url.searchParams.get('elements'),/postageFlag/);
  assert.equal(candidates.length, 1);
});

// Regression for the 2026-08 report: real credentials against the live
// openapi.rakuten.co.jp endpoint returned 403
// REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING for every request, so Rakuten
// contributed zero results end-to-end even with valid keys. Root cause:
// Rakuten's migrated API enforces the app's registered "許可されたウェブ
// サイト" (hoshilu.app) via the request's HTTP Referer, and a backend fetch
// sends no Referer by default. Confirmed live that adding both Referer and
// Origin resolves it. This locks in that both headers are always sent.
test('楽天市場APIへは登録済みサイトのRefererとOriginを付与する', async () => {
  let requested;
  await searchRakutenMarketplace(env, 'カットソー', async (url, options) => {
    requested = options;
    return Response.json({ items: [] });
  });
  assert.equal(requested.headers.referer, 'https://hoshilu.app/');
  assert.equal(requested.headers.origin, 'https://hoshilu.app');
});

test('複合条件が0件なら主要商品語で一度だけ再検索する', async () => {
  const requestedKeywords = [];
  const candidates = await searchRakutenMarketplaceWithFallback(
    env,
    ['小型 写真プリンター 手のひら スマホ対応', '小型 写真プリンター'],
    async (url) => {
      const keyword = new URL(url).searchParams.get('keyword');
      requestedKeywords.push(keyword);
      return {
        ok: true,
        async json() {
          if (keyword !== '小型 写真プリンター') return { items: [] };
          return {
            items: [{
              itemName: 'スマホ対応 ミニフォトプリンター',
              itemCode: 'shop:printer-1',
              itemPrice: 8980,
              itemUrl: 'https://item.rakuten.co.jp/shop/printer-1/',
              availability: 1
            }]
          };
        }
      };
    }
  );

  assert.deepEqual(requestedKeywords, [
    '小型 写真プリンター 手のひら スマホ対応',
    '小型 写真プリンター'
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].offers[0].marketplace, 'RAKUTEN_JP');
});

test('楽天の検索語候補は待ち時間を直列加算せず最大3本を同時照会する', async () => {
  let active = 0;
  let maxActive = 0;
  const requestedKeywords = [];
  const candidates = await searchRakutenMarketplaceWithFallback(
    env,
    ['天然石 ピアス', 'studio CLIP ピアス', '一粒 ピアス'],
    async (url) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      requestedKeywords.push(new URL(url).searchParams.get('keyword'));
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return Response.json({ items: [] });
    }
  );

  assert.deepEqual(requestedKeywords, ['天然石 ピアス', 'studio CLIP ピアス', '一粒 ピアス']);
  assert.equal(maxActive, 3);
  assert.deepEqual(candidates, []);
});

test('Rakuten API errors retain only safe status metadata', async () => {
  await assert.rejects(
    searchRakutenMarketplace(env, 'ローテーブル', async () => Response.json(
      { error: 'too_many_requests', error_description: 'request rejected' },
      { status: 429 }
    )),
    (error) => {
      assert.equal(error.message, 'RAKUTEN_MARKETPLACE_SEARCH_FAILED');
      assert.equal(error.status, 429);
      assert.equal(error.providerCode, 'too_many_requests');
      return true;
    }
  );
});

test('invalid affiliate redirects retry as verified direct Rakuten product URLs', async () => {
  const requests = [];
  const candidates = await searchRakutenMarketplace(env, 'ローテーブル', async (url) => {
    const requestUrl = new URL(url);
    requests.push(requestUrl);
    return Response.json({ items: [{
      itemName: '木製 ローテーブル',
      itemCode: 'shop:low-table',
      itemPrice: 4980,
      itemUrl: requestUrl.searchParams.has('affiliateId')
        ? 'https://hb.afl.rakuten.co.jp/changed-format/low-table'
        : 'https://item.rakuten.co.jp/shop/low-table/',
      affiliateUrl: requestUrl.searchParams.has('affiliateId')
        ? 'https://hb.afl.rakuten.co.jp/changed-format/low-table'
        : '',
      availability: 1
    }] });
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('affiliateId'), 'affiliate-id');
  assert.equal(requests[1].searchParams.has('affiliateId'), false);
  assert.equal(candidates[0].offers[0].product_url, 'https://item.rakuten.co.jp/shop/low-table/');
});
