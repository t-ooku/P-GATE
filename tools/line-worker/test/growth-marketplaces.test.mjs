import test from 'node:test';
import assert from 'node:assert/strict';
import { GROWTH_MARKETPLACES, growthMarketplace } from '../public/growth-marketplaces.mjs';

test('主要5モールとファッション5モールを送客分類する', () => {
  assert.equal(GROWTH_MARKETPLACES.length, 10);
  for (const marketplace of GROWTH_MARKETPLACES) {
    assert.equal(growthMarketplace(marketplace), marketplace);
  }
  assert.equal(growthMarketplace('', 'Yahoo!ショッピングで見る'), 'YAHOO_JP');
  assert.equal(growthMarketplace('', 'SNKRDUNKで見る'), 'SNKRDUNK_JP');
  assert.equal(growthMarketplace('', '不明なサイト'), '');
});
