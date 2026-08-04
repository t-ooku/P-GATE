import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketplaceApiKeywordCandidates,
  buildRakutenSearchKeywordCandidates
} from '../src/index.mjs';
import { filterCategoryMismatches } from '../src/knowledge-search.mjs';
import { searchRakutenMarketplaceWithFallback } from '../src/rakuten-marketplace-api.mjs';

test('detailed cut-and-sew wording retries the exact product noun', () => {
  assert.deepEqual(
    buildRakutenSearchKeywordCandidates('楽で涼しいカットソー 丈長めで色は白系 女性向けおしゃれ'),
    ['楽で涼しいカットソー 丈長めで色は白系 女性向けおしゃれ', 'カットソー']
  );
});

test('low table search retries the common center-table synonym', () => {
  assert.deepEqual(
    buildRakutenSearchKeywordCandidates('ローテーブル'),
    ['ローテーブル', 'センターテーブル']
  );
});

test('all connected marketplace APIs receive the original query, the organized-conditions retry, and the product-noun retry', () => {
  assert.deepEqual(
    buildMarketplaceApiKeywordCandidates(
      '楽で涼しいカットソー 丈長めで色は白系 女性向けおしゃれ',
      'white cooling long cut and sew top'
    ),
    [
      'white cooling long cut and sew top',
      'レディース トップス 白 涼しい おしゃれ',
      '楽で涼しいカットソー 丈長めで色は白系 女性向けおしゃれ',
      'カットソー'
    ]
  );
});

test('a clear product noun returns a linked marketplace item after the broad retry', async () => {
  const query = '楽で涼しいカットソー 丈長めで色は白系 女性向けおしゃれ';
  const calls = [];
  const items = await searchRakutenMarketplaceWithFallback(
    { RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'key' },
    buildRakutenSearchKeywordCandidates(query),
    async (url) => {
      const keyword = new URL(url).searchParams.get('keyword');
      calls.push(keyword);
      return Response.json(keyword === 'カットソー' ? { items: [{
        itemName: 'レディース 接触冷感 カットソー 白', itemCode: 'shop:cutsew',
        itemPrice: 1980, itemUrl: 'https://item.rakuten.co.jp/shop/cutsew/', availability: 1
      }] } : { items: [] });
    }
  );
  assert.deepEqual(calls, [query, 'カットソー']);
  assert.equal(filterCategoryMismatches(query, items).length, 1);
  assert.equal(items[0].offers[0].product_url, 'https://item.rakuten.co.jp/shop/cutsew/');
});
