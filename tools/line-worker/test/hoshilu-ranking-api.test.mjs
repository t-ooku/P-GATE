import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import worker from '../src/index.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

test('ランキング初回は商品を取得せず小ジャンルを1件ずつYES・NO確認する', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('/IchibaItem/Search/')) return Response.json({ Items: [] });
    throw new Error(`RANKING_FETCH_MUST_WAIT_FOR_YES:${target}`);
  };
  const request = new Request('https://hoshilu.app/api/hoshilu-rankings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'ハンディファン', confirmation_only: true, consent: true, session_id: 'ranking_session_123456', turnstile_token: 'verified-token' })
  });
  try {
    const response = await worker.fetch(request, {
      TURNSTILE_SECRET_KEY: 'turnstile-secret', RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'access', LINK_SIGNING_SECRET: 'l'.repeat(32)
    }, { waitUntil() {} });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.mode, 'category_confirmation');
    assert.equal(payload.result.confirmation.question, 'このジャンルですか？');
    assert.equal(payload.result.confirmation.options[0].label, 'ハンディファン');
    assert.equal(payload.result.confirmation.max_rejections, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test('総合人気ランキング応答に、価格根拠を分けたHOSHILU最安値ランキングを返す', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('openapi.rakuten.co.jp/ichibaranking')) return Response.json({ Items: [
      { rank: 1, itemName: 'テスト ハンディファン', itemUrl: 'https://item.rakuten.co.jp/shop/item/', itemPrice: 2980, reviewAverage: 4.6, reviewCount: 300 }
    ] });
    if (target.includes('shopping.yahooapis.jp')) return Response.json({ hits: [
      { code: 'cheap-charger', name: 'USB充電器 急速20W #ハンディファン #夏', url: 'https://store.shopping.yahoo.co.jp/shop/cheap-charger.html', price: 100, shipping: { code: 2 } }
    ] });
    throw new Error(`UNEXPECTED_FETCH:${target}`);
  };
  const request = new Request('https://hoshilu.app/api/hoshilu-rankings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'ハンディファン', consent: true, session_id: 'ranking_session_123456', turnstile_token: 'verified-token' })
  });
  try {
    const response = await worker.fetch(request, {
      TURNSTILE_SECRET_KEY: 'turnstile-secret', RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'access', YAHOO_SHOPPING_CLIENT_ID: 'client', LINK_SIGNING_SECRET: 'l'.repeat(32)
    }, { waitUntil() {} });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.ranking_type, 'HOSHILU総合人気ランキング（ベータ）');
    assert.equal(payload.result.ai_cheapest.ranking_type, 'HOSHILU最安値ランキング（ベータ）');
    assert.equal(payload.result.ai_cheapest.candidates[0].ai_cheapest_price_source, 'OBSERVED_ITEM_PRICE');
    assert.equal(payload.result.ai_cheapest.candidates[0].ai_cheapest_price_min, 2980);
    assert.equal(payload.result.ai_cheapest.candidates.some((candidate) => candidate.product_name.includes('USB充電器')), false);
    assert.match(payload.result.ai_cheapest.methodology, /小ジャンルの商品本体だけ/);
    assert.match(payload.result.ai_cheapest.disclaimer, /AI推定価格/);
  } finally { globalThis.fetch = originalFetch; }
});

test('公式Genre Searchで確認した固定辞書外の小分類から総合ランキングを取得する', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('/IchibaGenre/Search/')) return Response.json({ genre:{genreId:'204586',nameJa:'炊飯器',level:3}, ancestors:[{genreId:'100644',nameJa:'キッチン家電',level:2}] });
    if (target.includes('/IchibaItem/Ranking/')) return Response.json({ Items:[
      { rank:1,itemName:'公式分類の炊飯器',itemUrl:'https://item.rakuten.co.jp/shop/rice/',itemPrice:12000,reviewCount:100 }
    ] });
    throw new Error(`UNEXPECTED_FETCH:${target}`);
  };
  const request = new Request('https://hoshilu.app/api/hoshilu-rankings', {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
      query:'炊飯器', category_selection:{id:'rakuten_204586',label:'炊飯器',genre_id:'204586',source:'RAKUTEN_GENRE_API'},
      consent:true, session_id:'ranking_session_123456', turnstile_token:'verified-token'
    })
  });
  try {
    const response = await worker.fetch(request, { TURNSTILE_SECRET_KEY:'turnstile-secret',RAKUTEN_APPLICATION_ID:'app',RAKUTEN_ACCESS_KEY:'access',LINK_SIGNING_SECRET:'l'.repeat(32) }, {waitUntil(){}});
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.category.label, 'キッチン家電 › 炊飯器');
    assert.equal(payload.result.candidates[0].product_name, '公式分類の炊飯器');
  } finally { globalThis.fetch = originalFetch; }
});

test('クライアントが作った未確認ジャンル指定はAPI境界で拒否する', async () => {
  const request = new Request('https://hoshilu.app/api/hoshilu-rankings', {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
      query:'炊飯器', category_selection:{id:'rakuten_204586',label:'炊飯器',genre_id:'204586',source:'UNVERIFIED'},
      consent:true, session_id:'ranking_session_123456', turnstile_token:'verified-token'
    })
  });
  const response = await worker.fetch(request, {}, {waitUntil(){}});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'RANKING_CATEGORY_SELECTION_INVALID');
});

test('固定辞書にない入力へ楽天公式小分類の選択肢を返す', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    if (target.hostname === 'challenges.cloudflare.com') return Response.json({success:true});
    if (target.pathname.includes('/IchibaItem/Search/')) return Response.json({Items:[{genreId:'204586',itemName:'炊飯器A'},{genreId:'204586',itemName:'炊飯器B'}]});
    if (target.pathname.includes('/IchibaGenre/Search/')) return Response.json({genre:{genreId:'204586',nameJa:'炊飯器',level:3},ancestors:[{genreId:'100644',nameJa:'キッチン家電',level:2}]});
    throw new Error(`UNEXPECTED_FETCH:${target}`);
  };
  const request = new Request('https://hoshilu.app/api/hoshilu-rankings', {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({query:'炊飯器',consent:true,session_id:'ranking_session_123456',turnstile_token:'verified-token'})
  });
  try {
    const response = await worker.fetch(request, {TURNSTILE_SECRET_KEY:'turnstile-secret',RAKUTEN_APPLICATION_ID:'app',RAKUTEN_ACCESS_KEY:'access'}, {waitUntil(){}});
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.mode, 'clarification');
    assert.deepEqual(payload.result.clarification.options[0], {value:'rakuten_204586',label:'キッチン家電 › 炊飯器',query:'炊飯器',genre_id:'204586',source:'RAKUTEN_GENRE_API',official_category:true});
  } finally { globalThis.fetch = originalFetch; }
});
