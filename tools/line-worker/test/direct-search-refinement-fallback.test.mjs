import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAmazonSearchKeywords,
  buildMarketplaceApiKeywordCandidates,
  buildRakutenSearchKeywords,
  buildRakutenSearchKeywordCandidates,
  filterSearchCandidatesWithFallback
} from '../src/index.mjs';
import { searchRakutenMarketplaceWithFallback } from '../src/rakuten-marketplace-api.mjs';

test('すぐ検索はAI変換語を先に使い、0件時だけ元の検索条件を最後の候補にする', () => {
  const refined = 'ワイヤレスイヤホン ノイズキャンセリング';
  const original = '電車で周りの音が聞こえにくい耳につける線のないもの';
  const candidates = buildMarketplaceApiKeywordCandidates(
    refined,
    buildAmazonSearchKeywords(refined),
    buildAmazonSearchKeywords(original)
  );
  assert.equal(candidates[0], buildAmazonSearchKeywords(refined));
  assert.ok(candidates.includes(buildAmazonSearchKeywords(original)));
});

test('楽天もAI変換が不成立の時だけ原文側キーワードへ戻れる', () => {
  const candidates = buildRakutenSearchKeywordCandidates('誤ったAI変換商品', 'レディース 長袖 白 カットソー');
  assert.ok(candidates.some((value) => /カットソー/u.test(value)));
});

test('AI変換カテゴリに適合商品が無ければ原文カテゴリの商品を救済する', () => {
  const candidates = [
    { asin: 'FAN', product_name: '静音 ハンディファン 5段階', display_name: '静音 ハンディファン 5段階' },
    { asin: 'EARPHONE', product_name: '完全ワイヤレスイヤホン', display_name: '完全ワイヤレスイヤホン' }
  ];
  const result = filterSearchCandidatesWithFallback('カットソー', 'ワイヤレスイヤホン', candidates);
  assert.deepEqual(result.map((item) => item.asin), ['EARPHONE']);
});

test('楽天APIもAI変換語と識別子が外れた後に原文商品を実際に採用する', async () => {
  const refined = 'WRONGBRAND カットソー';
  const original = 'ワイヤレスイヤホン';
  const fallbackKeywords = buildRakutenSearchKeywords(original);
  const keywords = buildRakutenSearchKeywordCandidates(refined, original);
  const calls = [];
  const result = await searchRakutenMarketplaceWithFallback(
    { RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'access' },
    keywords,
    async (url) => {
      const keyword = new URL(url).searchParams.get('keyword');
      calls.push(keyword);
      return Response.json(keyword === fallbackKeywords ? { items: [{
        itemName: '完全ワイヤレスイヤホン ノイズキャンセリング',
        itemCode: 'shop:earphone', itemPrice: 4980,
        itemUrl: 'https://item.rakuten.co.jp/shop/earphone/', availability: 1
      }] } : { items: [] });
    },
    refined,
    'refinement-fallback-test',
    original
  );
  assert.equal(calls.at(-1), fallbackKeywords);
  assert.equal(result[0].product_name, '完全ワイヤレスイヤホン ノイズキャンセリング');
});
