// 2026-09-05 夜 大隆さん指示: トップに「ショップから探す」。先駆者として ITG の3店舗を掲載。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handlePublicShopDirectoryRoute } from '../src/seller-shop.mjs';

test('GET /api/shops は掲載中ショップを slug/name/logo/tagline/coupon/url だけで返す（seller_key は出さない）', async () => {
  const rows = [
    { seller_key: 'k1', slug: 'with-care', shop_name: 'with care', logo_url: 'https://hoshilu.app/shop-logos/with-care.svg', tagline: '思いやりのある暮らし', tenants: '["itg"]', seller_ids: '[]', live_coupons: 0 },
    { seller_key: 'k2', slug: 'find-fun', shop_name: 'Find fun', logo_url: '', tagline: '', tenants: '["itt"]', seller_ids: '[]', live_coupons: 2 }
  ];
  const env = { PRODUCT_DB: { prepare() { return { bind() { return { all: async () => ({ results: rows }) }; } }; } } };
  const response = await handlePublicShopDirectoryRoute(new Request('https://hoshilu.app/api/shops'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.shops.map(shop => [shop.slug, shop.name, shop.coupon, shop.url]), [
    ['with-care', 'with care', false, '/shop/with-care'], ['find-fun', 'Find fun', true, '/shop/find-fun']
  ]);
  for (const shop of payload.shops) assert.ok(!('seller_key' in shop));
  assert.equal(await handlePublicShopDirectoryRoute(new Request('https://hoshilu.app/api/other'), env), null);
});

test('トップに「ショップから探す」ボタンと一覧欄があり、ランキングの隣・BUZZの前に置かれる', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<button id="rankingSearchButton"[^>]*>ランキングで探す<\/button><button id="shopSearchButton"[^>]*>ショップから探す<\/button>/);
  assert.match(html, /id="shopDirectory"/);
  assert.match(html, /shop-directory\.mjs\?v=1/);
  assert.match(html, /shop-directory\.css\?v=1/);
  assert.ok(html.indexOf('id="shopDirectory"') < html.indexOf('id="buzzHome"'));
  const client = readFileSync(new URL('../public/shop-directory.mjs', import.meta.url), 'utf8');
  assert.match(client, /\/api\/shops/);
  assert.doesNotMatch(client, /innerHTML/);
});
