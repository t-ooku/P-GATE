import test from 'node:test';
import assert from 'node:assert/strict';
import { GROWTH_MARKETPLACES, growthMarketplace } from '../public/growth-marketplaces.mjs';

test('統合3モールと直接検索10モールを送客分類する(v4.2項目14で5モール追加)', () => {
  assert.equal(GROWTH_MARKETPLACES.length, 15);
  for (const marketplace of GROWTH_MARKETPLACES) {
    assert.equal(growthMarketplace(marketplace), marketplace);
  }
  assert.equal(growthMarketplace('', 'Yahoo!ショッピングで見る'), 'YAHOO_JP');
  assert.equal(growthMarketplace('', 'SNKRDUNKで見る'), 'SNKRDUNK_JP');
  assert.equal(growthMarketplace('', 'ロフトで見る'), 'LOFT_JP');
  assert.equal(growthMarketplace('', 'ABC-MARTで見る'), 'ABCMART_JP');
  assert.equal(growthMarketplace('', '不明なサイト'), '');
});
