import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSaleNotificationBody, handleMarketplaceSaleRoutes, isOfficialMarketplaceSource } from '../src/marketplace-sales.mjs';

test('sale notifications include a tappable official marketplace URL', () => {
  const body = buildSaleNotificationBody({
    marketplace: 'RAKUTEN_JP',
    summary: '楽天市場公式で掲載中のキャンペーン情報です。',
    source_url: 'https://event.rakuten.co.jp/'
  });
  assert.equal(body, '楽天市場公式で掲載中のキャンペーン情報です。\n\n公式ページを開く\nhttps://event.rakuten.co.jp/');
  assert.doesNotMatch(buildSaleNotificationBody({
    marketplace: 'RAKUTEN_JP', summary: '案内', source_url: 'https://example.com/'
  }), /example\.com/);
});

test('13モールの記事・セール出典は対応する公式HTTPSドメインだけを許可する', () => {
  const valid = [
    ['AMAZON_JP','https://www.amazon.co.jp/deals'], ['RAKUTEN_JP','https://event.rakuten.co.jp/'],
    ['YAHOO_JP','https://shopping.yahoo.co.jp/promotion/campaign/'], ['QOO10_JP','https://www.qoo10.jp/gmkt.inc/Events/Promotion.aspx'],
    ['SHEIN_JP','https://jp.shein.com/'], ['ZOZOTOWN','https://zozo.jp/'], ['LOFT_JP','https://www.loft.co.jp/store/'],
    ['HANDS_JP','https://hands.net/'], ['MATSUKIYO_JP','https://www.matsukiyococokara-online.com/'],
    ['COSME_JP','https://www.cosme.com/'], ['ABCMART_JP','https://www.abc-mart.net/shop/'],
    ['BUYMA','https://www.buyma.com/'], ['SNKRDUNK','https://snkrdunk.com/information/']
  ];
  for (const [marketplace,url] of valid) assert.equal(isOfficialMarketplaceSource(marketplace,url), true, marketplace);
  assert.equal(isOfficialMarketplaceSource('AMAZON_JP','https://amazon.co.jp.evil.example/deals'), false);
  assert.equal(isOfficialMarketplaceSource('YAHOO_JP','https://example.com/campaign'), false);
  assert.equal(isOfficialMarketplaceSource('QOO10_JP','http://www.qoo10.jp/event'), false);
});

test('承認済みメディアでも安全でないURLは登録しない', async () => {
  const secret = 'x'.repeat(32);
  const response = await handleMarketplaceSaleRoutes(new Request('https://hoshilu.app/api/internal/sales', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hoshilu-internal-secret': secret },
    body: JSON.stringify({
      marketplace: 'YAHOO_JP', info_type: 'SALE', source_url: 'https://shopping.yahoo.co.jp/promotion/campaign/',
      starts_at: '2026-08-02T00:00:00.000Z', ends_at: '2026-08-03T00:00:00.000Z',
      image_rights_status: 'APPROVED', image_url: 'javascript:alert(1)', status: 'APPROVED'
    })
  }), { MYWATCH_CRON_SECRET: secret, PRODUCT_DB: { prepare: () => { throw new Error('must not write'); } } });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'SALE_MEDIA_URL_INVALID');
});
