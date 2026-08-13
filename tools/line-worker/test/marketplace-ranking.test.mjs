import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKETPLACE_RANKING_CAPABILITIES, resolveRankingCategory, normalizeRakutenRanking, fetchRakutenRanking, suggestRankingCategoriesWithAi, normalizeRakutenGenre, discoverRakutenRankingCategories, marketplaceRankingResult, rankingCategoryConfirmationResult } from '../src/marketplace-ranking.mjs';

test('ランキング検索の必須5語を公式確認済みの楽天子ジャンルへ解決する', () => {
  const expected = new Map([['ハンディファン','565082'],['ワイヤレスイヤホン','502835'],['レディーススニーカー','206906'],['モバイルバッテリー','564277'],['化粧水','216307']]);
  for (const [query, genre] of expected) assert.equal(resolveRankingCategory(query).category.genre_id, genre);
});

test('曖昧なカテゴリは広い順位を捏造せず確認質問を返す', () => {
  const result = resolveRankingCategory('靴');
  assert.equal(result.resolved, false);
  assert.ok(result.clarification.options.length >= 4);
  assert.equal(result.clarification.options[0].value, 'womens_sneakers');
  assert.match(result.clarification.guidance, /小分類/);
  assert.equal(resolveRankingCategory('扇風機').resolved, false);
});

test('AIは登録済み小分類だけを候補として返し、分類を勝手に確定しない', async () => {
  const options = resolveRankingCategory('靴').clarification.options;
  const ids = await suggestRankingCategoriesWithAi({ GEMINI_API_KEY: 'g'.repeat(32) }, '靴', options, async (_url, init) => {
    assert.match(JSON.parse(init.body).contents[0].parts[0].text, /選択肢にない分類は作らず/);
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"category_ids":["womens_sneakers","not_allowed"]}' }] } }] });
  });
  assert.deepEqual(ids, ['womens_sneakers']);
});

test('Capability Registryは13モールを方式とレビュー範囲つきで一元管理する', () => {
  assert.equal(MARKETPLACE_RANKING_CAPABILITIES.length, 13);
  assert.deepEqual(MARKETPLACE_RANKING_CAPABILITIES.find((item) => item.marketplace_id === 'RAKUTEN_JP'), { marketplace_id:'RAKUTEN_JP', label:'楽天市場', ranking_mode:'native_api', review_mode:'summary_api', status:'available' });
  assert.deepEqual(MARKETPLACE_RANKING_CAPABILITIES.find((item) => item.marketplace_id === 'YAHOO_JP'), { marketplace_id:'YAHOO_JP', label:'Yahoo!ショッピング', ranking_mode:'native_api', review_mode:'aggregate_api', status:'available' });
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

test('楽天公式の商品genreIdとGenre Searchから固定辞書外の小分類候補を発見する', async () => {
  const calls = [];
  const result = await discoverRakutenRankingCategories({ RAKUTEN_APPLICATION_ID:'app', RAKUTEN_ACCESS_KEY:'access' }, '炊飯器', async (url) => {
    calls.push(url); const target = new URL(url);
    if (target.pathname.includes('/IchibaItem/Search/')) return Response.json({ Items: [
      { genreId:'204586', itemName:'炊飯器A' }, { genreId:'204586', itemName:'炊飯器B' }, { genreId:'211734', itemName:'炊飯器部品' }
    ] });
    const id = target.searchParams.get('genreId');
    return Response.json({ genre:{ genreId:id, nameJa:id==='204586'?'炊飯器':'炊飯器部品', level:3 }, ancestors:[{genreId:'100644',nameJa:'キッチン家電',level:2}] });
  });
  assert.equal(result[0].genre_id, '204586');
  assert.equal(result[0].label, 'キッチン家電 › 炊飯器');
  assert.equal(result[0].official_category, true);
  assert.ok(calls.some((url) => url.includes('/20260701')));
});

test('家電・美容以外も公式商品ジャンルから小分類確認へ展開する', async () => {
  const genres = [
    ['炊飯器','204586'],['電動歯ブラシ','208522'],['ベビーカー','401151'],['キャットタワー','206265'],
    ['テント','302373'],['ゴルフ距離計','506027'],['フライパン','559219'],['枕','205582'],
    ['ビジネスバッグ','502221'],['腕時計','558929'],['プリンター','110080'],['万年筆','210246']
  ];
  for (const [label, genreId] of genres) {
    const result = await rankingCategoryConfirmationResult({ RAKUTEN_APPLICATION_ID:'app', RAKUTEN_ACCESS_KEY:'access' }, label, async (url) => {
      const target = new URL(url);
      if (target.pathname.includes('/IchibaItem/Search/')) return Response.json({ Items:[{genreId,itemName:`${label} 商品`} ] });
      if (target.pathname.includes('/IchibaGenre/Search/')) return Response.json({ genre:{genreId,nameJa:label,level:3},ancestors:[{genreId:'100000',nameJa:'商品カテゴリ',level:2}] });
      throw new Error(`unexpected: ${url}`);
    });
    assert.equal(result.confirmation.options[0].genre_id, genreId, label);
    assert.match(result.confirmation.options[0].label, new RegExp(label), label);
  }
});

test('動的な小分類選択はGenre Searchで再検証してから公式ランキングへ渡す', async () => {
  const result = await marketplaceRankingResult({ RAKUTEN_APPLICATION_ID:'app', RAKUTEN_ACCESS_KEY:'access' }, '炊飯器', 'RAKUTEN_JP', async (url) => {
    const target = new URL(url);
    if (target.pathname.includes('/IchibaGenre/Search/')) return Response.json({ genre:{ genreId:'204586', nameJa:'炊飯器', level:3 }, ancestors:[{genreId:'100644',nameJa:'キッチン家電',level:2}] });
    if (target.pathname.includes('/IchibaItem/Ranking/')) return Response.json({ Items:[{rank:1,itemName:'人気炊飯器',itemUrl:'https://item.rakuten.co.jp/shop/rice/',itemPrice:10000}] });
    throw new Error(`unexpected: ${url}`);
  }, { id:'rakuten_204586', label:'炊飯器', genre_id:'204586', source:'RAKUTEN_GENRE_API' });
  assert.equal(result.category.label, 'キッチン家電 › 炊飯器');
  assert.equal(result.candidates[0].product_name, '人気炊飯器');
});

test('ランキング件数不足なら架空順位にせず楽天口コミ件数順へ明示してフォールバックする', async () => {
  const result = await marketplaceRankingResult({ RAKUTEN_APPLICATION_ID:'app', RAKUTEN_ACCESS_KEY:'access' }, 'ハンディファン', 'RAKUTEN_JP', async (url) => {
    const target = new URL(url);
    if (target.pathname.includes('/IchibaItem/Ranking/')) return new Response('{}',{status:404});
    if (target.pathname.includes('/IchibaItem/Search/')) {
      assert.equal(target.searchParams.get('sort'), '-reviewCount');
      return Response.json({ Items:[{itemName:'口コミ多数',itemUrl:'https://item.rakuten.co.jp/shop/fan/',itemPrice:3000,reviewCount:500}] });
    }
    throw new Error(`unexpected: ${url}`);
  });
  assert.equal(result.mode, 'derived_api');
  assert.equal(result.ranking_type, '楽天市場 口コミ件数順');
  assert.equal(result.candidates[0].review_count, 500);
});

test('Yahoo!は高評価トレンドランキングを公式順位のまま返す', async () => {
  const result = await marketplaceRankingResult({ YAHOO_SHOPPING_CLIENT_ID:'client' }, 'ワイヤレスイヤホン', 'YAHOO_JP', async (url) => {
    const target = new URL(url);
    assert.equal(target.pathname, '/ShoppingWebService/V1/highRatingTrendRanking');
    return Response.json({ high_rating_trend_ranking: { ranking_data:[{
      rank:1,
      item_information:{name:'Yahoo公式1位',code:'earphone-1',url:'https://store.shopping.yahoo.co.jp/shop/earphone-1.html',regular_price:5000},
      review:{rate:4.8,count:800,url:'https://shopping.yahoo.co.jp/review/item/list?store_id=shop&page_key=earphone-1'}
    }] } });
  });
  assert.equal(result.mode, 'native_api');
  assert.equal(result.ranking_type, 'Yahoo!ショッピング 高評価トレンドランキング');
  assert.equal(result.candidates[0].product_name, 'Yahoo公式1位');
  assert.equal(result.candidates[0].rank, 1);
});

test('Yahoo!高評価API障害時は口コミ件数順へ縮退する', async () => {
  const result = await marketplaceRankingResult({ YAHOO_SHOPPING_CLIENT_ID:'client' }, 'ワイヤレスイヤホン', 'YAHOO_JP', async (url) => {
    const target = new URL(url);
    if (target.pathname.includes('highRatingTrendRanking')) return new Response('{}', { status: 503 });
    assert.equal(target.pathname, '/ShoppingWebService/V3/itemSearch');
    assert.equal(target.searchParams.get('sort'), '-review_count');
    return Response.json({ hits:[{name:'口コミ多数イヤホン',code:'fallback-1',url:'https://store.shopping.yahoo.co.jp/shop/fallback-1.html',price:4000,review:{rate:4.5,count:700}}] });
  });
  assert.equal(result.mode, 'derived_api');
  assert.equal(result.ranking_type, 'Yahoo!ショッピング 口コミ件数順');
  assert.equal(result.candidates[0].review_count, 700);
});

test('Genre Search応答は公式の親子階層だけを正規化する', () => {
  assert.deepEqual(normalizeRakutenGenre({ genre:{genreId:'123456',nameJa:'ドッグフード',level:3}, ancestors:[{genreId:'1',nameJa:'ペット用品',level:1},{genreId:'2',nameJa:'犬用品',level:2}] }), {
    genre_id:'123456', label:'ドッグフード', level:3, path:['ペット用品','犬用品','ドッグフード']
  });
});
