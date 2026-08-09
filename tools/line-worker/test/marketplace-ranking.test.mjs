import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKETPLACE_RANKING_CAPABILITIES, resolveRankingCategory, normalizeRakutenRanking, fetchRakutenRanking } from '../src/marketplace-ranking.mjs';

test('ランキング検索の必須5語を公式確認済みの楽天子ジャンルへ解決する', () => {
  const expected = new Map([['ハンディファン','565082'],['ワイヤレスイヤホン','502835'],['レディーススニーカー','206906'],['モバイルバッテリー','564277'],['化粧水','216307']]);
  for (const [query, genre] of expected) assert.equal(resolveRankingCategory(query).category.genre_id, genre);
});

test('曖昧なカテゴリは広い順位を捏造せず確認質問を返す', () => {
  const result = resolveRankingCategory('靴');
  assert.equal(result.resolved, false);
  assert.ok(result.clarification.options.length >= 4);
});

test('Capability Registryは13モールを方式とレビュー範囲つきで一元管理する', () => {
  assert.equal(MARKETPLACE_RANKING_CAPABILITIES.length, 13);
  assert.deepEqual(MARKETPLACE_RANKING_CAPABILITIES.find((item) => item.marketplace_id === 'RAKUTEN_JP'), { marketplace_id:'RAKUTEN_JP', label:'楽天市場', ranking_mode:'native_api', review_mode:'summary_api', status:'available' });
  assert.ok(MARKETPLACE_RANKING_CAPABILITIES.every((item) => item.ranking_mode && item.review_mode));
});

test('楽天ランキング応答は公式順位・評価・件数だけを正規化する', () => {
  const items = normalizeRakutenRanking({ Items: [{ rank: 2, itemName:'商品', itemUrl:'https://item.rakuten.co.jp/shop/code/', itemPrice:3980, reviewAverage:4.62, reviewCount:352, mediumImageUrls:[{imageUrl:'https://example.com/a.jpg'}] }] });
  assert.equal(items[0].rank, 2); assert.equal(items[0].review_average, 4.62); assert.equal(items[0].review_count, 352);
  assert.equal('review_body' in items[0], false);
});

test('楽天Ranking APIへaccessKeyとgenreIdを送りRefererを付ける', async () => {
  let requestUrl=''; let headers={};
  const result = await fetchRakutenRanking({ RAKUTEN_APPLICATION_ID:'app', RAKUTEN_ACCESS_KEY:'access' }, { genre_id:'564277' }, async (url, init) => { requestUrl=url; headers=init.headers; return { ok:true, json:async()=>({Items:[]}) }; });
  assert.deepEqual(result, []); const url=new URL(requestUrl);
  assert.equal(url.searchParams.get('genreId'),'564277'); assert.equal(url.searchParams.get('accessKey'),'access'); assert.equal(headers.referer,'https://hoshilu.app/');
});
