import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import worker from '../src/index.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

function environment(rows) {
  return {
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_SITE_KEY: 'site-key',
    GAS_BACKEND_URL: 'https://script.google.com/macros/s/test-deployment/exec',
    GAS_BRIDGE_SECRET: 'g'.repeat(32),
    LINK_SIGNING_SECRET: 'l'.repeat(32),
    PRODUCT_DB: {
      prepare() {
        return { bind() { return { all: async () => ({ results: rows }) }; } };
      }
    }
  };
}

function request(query, language = 'JA', searchAttempt = 1) {
  return new Request('https://hoshilu.app/api/knowledge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      language,
      search_attempt: searchAttempt,
      processing_notice_shown: true,
      session_id: 'anonymous_session_123456',
      turnstile_token: 'verified-token'
    })
  });
}

function imageRequest(query = 'これ何？', aiCandidateFallback = null) {
  return new Request('https://hoshilu.app/api/knowledge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      language: 'JA',
      search_attempt: 1,
      processing_notice_shown: true,
      session_id: 'anonymous_session_123456',
      turnstile_token: 'verified-token',
      image: { mime_type: 'image/jpeg', data: '/9j/4AAQ' },
      ...(aiCandidateFallback ? { ai_candidate_fallback: aiCandidateFallback } : {})
    })
  });
}

const context = { waitUntil() {} };

test('public search API attempts product presentation from the first search and suggests MYWISH', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('siteverify')
    ? Response.json({ success: true })
    : Response.json({ ok: true, result: { query_id: 'gas-q1', candidates: [], message: '' } });
  try {
    const response = await worker.fetch(request('SNSで見た青いやつ'), environment([]), context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.result.candidates, []);
    assert.equal(payload.result.clarification.required, false);
    assert.equal(payload.result.search_guidance.product_presentation_required, true);
    assert.equal(payload.result.mywish.suggested, true);
    const secondResponse = await worker.fetch(request('SNSで見た青いもの / 遊び・趣味に使う'), environment([]), context);
    const secondPayload = await secondResponse.json();
    assert.equal(secondResponse.status, 200, JSON.stringify(secondPayload));
    assert.equal(secondPayload.result.clarification.required, false);
    assert.equal(secondPayload.result.search_guidance.continuation, true);
    assert.equal(secondPayload.result.search_guidance.product_presentation_required, true);
    assert.match(secondPayload.result.amazon_search_url, /\/go\?/);
    const thirdResponse = await worker.fetch(request('SNSで見た青いもの / 遊び・趣味に使う / 手のひらサイズ'), environment([]), context);
    const thirdPayload = await thirdResponse.json();
    assert.equal(thirdResponse.status, 200, JSON.stringify(thirdPayload));
    assert.equal(thirdPayload.result.clarification.required, false);
    assert.match(thirdPayload.result.amazon_search_url, /\/go\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('second search presents an indexed product instead of asking again', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('siteverify')
    ? Response.json({ success: true })
    : Response.json({ ok: true, result: { query_id: 'gas-second', candidates: [], message: '' } });
  const row = {
    asin: 'B000SECOND', product_name: 'Blue light-up phone case', manufacturer: 'Example',
    image_url: 'https://images.example.test/case.jpg', stock: 2
  };
  try {
    const response = await worker.fetch(request('TikTokで見た光るスマホケース', 'JA', 2), environment([row]), context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.clarification.required, false);
    assert.equal(payload.result.search_guidance.product_presentation_required, true);
    assert.equal(payload.result.search_guidance.product_presentation_met, true);
    assert.equal(payload.result.candidates[0].asin, row.asin);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI product intent analysis runs from the first search when ten-mall candidates remain empty', async () => {
  const originalFetch = globalThis.fetch;
  let aiCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) {
      aiCalls += 1;
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        category: 'スマートフォンアクセサリー',
        intent_summary: '見たことのない光る小物',
        features: ['光る', '小型'],
        product_candidates: [{
          name: 'LED スマホアクセサリー',
          match_score: 86,
          reason: '光る小物という視覚的な手がかりに一致',
          matched_features: ['光る', '小型'],
          search_keywords: ['LED スマホアクセサリー', '光る 小物']
        }],
        search_keywords: ['光る 小物', 'LED スマホアクセサリー'],
        multilingual_keywords: {
          ja: ['光る 小物'], en: ['LED phone accessory'], zh: [], ko: []
        }
      }) }] } }] });
    }
    return Response.json({ ok: true, result: { query_id: 'gas-ai-fallback', candidates: [], message: '' } });
  };
  const env = { ...environment([]), GEMINI_API_KEY: 'g'.repeat(32) };
  try {
    const firstPayload = await (await worker.fetch(request('見たことのない光る小物', 'JA', 1), env, context)).json();
    // 通常検索の高速な検索語変換1回 + 候補0件時の商品意図解析1回。
    assert.equal(aiCalls, 2);
    assert.equal(firstPayload.result.ai_discovery.provider, 'GEMINI_PRODUCT_INTENT');
    assert.equal(firstPayload.result.ai_discovery.analysis.product_candidates[0].name, 'LED スマホアクセサリー');
    assert.deepEqual(firstPayload.result.ai_discovery.analysis.search_keywords, ['光る 小物', 'LED スマホアクセサリー']);
    const secondPayload = await (await worker.fetch(request('見たことのない光る小物', 'JA', 2), env, context)).json();
    assert.equal(aiCalls, 4);
    assert.equal(secondPayload.result.candidates.length, 0);
    assert.equal(secondPayload.result.ai_discovery.provider, 'GEMINI_PRODUCT_INTENT');
    assert.equal(secondPayload.result.ai_discovery.analysis.product_candidates[0].match_score, 86);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('first search always checks a configured marketplace API even when an indexed candidate exists', async () => {
  const originalFetch = globalThis.fetch;
  let rakutenCalls = 0;
  let officialStoreCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('openapi.rakuten.co.jp')) {
      // 2026-08-18: モール公式店の名指し検索(shopCode付き)を追加したので、
      // 本体検索の呼び出し回数だけを数える。このテストの意図は
      // 「フォールバック段が直列に膨らんでいないこと」の固定なので、
      // 性質の違う店舗名指し検索は別カウントにする。
      if (new URL(target).searchParams.get('shopCode')) officialStoreCalls += 1;
      else rakutenCalls += 1;
      return Response.json({items:[{
        itemName:'送料無料 光るスマホケース',itemCode:'shop:case-1',itemPrice:2980,postageFlag:0,
        itemUrl:'https://item.rakuten.co.jp/shop/case-1/',availability:1
      }]});
    }
    return Response.json({ ok: true, result: { query_id: 'gas-first-marketplace', candidates: [], message: '' } });
  };
  const row={asin:'B000INDEX01',product_name:'光るスマホケース',image_url:'https://images.example.test/index.jpg',stock:1};
  const env={...environment([row]),RAKUTEN_APPLICATION_ID:'app',RAKUTEN_ACCESS_KEY:'key'};
  try{
    const payload=await (await worker.fetch(request('TikTokで見た光るスマホケース','JA',1),env,context)).json();
    // Primary and bounded fallback keywords are now checked concurrently so
    // one slow variant does not add another full provider timeout window.
    assert.ok(rakutenCalls >= 1 && rakutenCalls <= 3, `unexpected Rakuten call count: ${rakutenCalls}`);
    // 公式店は1店舗につき1回だけ。フォールバック段を持たせない
    // (外部APIの呼び出し回数が店舗数×段数で膨らむのを防ぐ)。
    assert.ok(officialStoreCalls <= 4, `unexpected official store call count: ${officialStoreCalls}`);
    assert.equal(payload.result.candidates.some(item=>item.offers?.some(offer=>offer.marketplace==='RAKUTEN_JP')),true);
  }finally{globalThis.fetch=originalFetch;}
});

test('画像特定はライブモールAPIを待たず、DB候補があってもAI仮説と13モール導線を返す', async () => {
  const originalFetch = globalThis.fetch;
  let rakutenCalls = 0;
  const gasCandidate = {
    asin: 'B000PUGBEI',
    product_name: 'アミューズ 豆しば三兄弟 パグ兵衛 ぬいぐるみ',
    manufacturer: 'アミューズ',
    image_url: 'https://images.example.test/pugbei.jpg',
    stock: 1
  };
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) {
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        refined_query: 'アミューズ 豆しば三兄弟 パグ兵衛 ぬいぐるみ',
        candidate_name: '豆しば三兄弟 パグ兵衛',
        candidate_brand: 'アミューズ',
        candidate_reason: 'パグの外観と緑の唐草模様バンダナが一致',
        matched_features: ['パグ', '緑の唐草模様バンダナ'],
        match_score: 91
      }) }] } }] });
    }
    if (target.includes('openapi.rakuten.co.jp')) {
      rakutenCalls += 1;
      throw new Error('multimodal search must not wait for Rakuten');
    }
    return Response.json({ ok: true, result: {
      query_id: 'gas-image-fast', candidates: [gasCandidate], message: ''
    } });
  };
  const env = {
    ...environment([gasCandidate]),
    GEMINI_API_KEY: 'g'.repeat(32),
    RAKUTEN_APPLICATION_ID: 'app',
    RAKUTEN_ACCESS_KEY: 'key'
  };
  try {
    const response = await worker.fetch(imageRequest(), env, context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(rakutenCalls, 0);
    assert.equal(payload.result.candidates.some(item => item.asin === gasCandidate.asin), true);
    assert.equal(payload.result.search_input_analysis.candidate_name, '豆しば三兄弟 パグ兵衛');
    assert.match(payload.result.ai_query_refinement.effective_query, /パグ兵衛/u);
    assert.equal(payload.result.ai_discovery.analysis.product_candidates[0].identification_status, 'AI_HYPOTHESIS');
    assert.equal(payload.result.ai_discovery.analysis.product_candidates[0].selected_by_user, false);
    assert.equal(payload.result.ai_discovery.analysis.product_candidates[0].marketplace_search_links.length, 13);
    for (const link of payload.result.ai_discovery.analysis.product_candidates[0].marketplace_search_links) {
      const destination = new URL(link.url);
      assert.equal(destination.origin, 'https://hoshilu.app');
      assert.equal(destination.pathname, '/go');
    }
    const confirmed = {
      name: '利用者が確認した パグ兵衛 限定版',
      brand: 'アミューズ',
      reason: '利用者がAI候補から選択済み',
      matched_features: ['パグ', '緑のバンダナ'],
      match_score: 97
    };
    const confirmedResponse = await worker.fetch(imageRequest('これ何？', confirmed), env, context);
    const confirmedPayload = await confirmedResponse.json();
    assert.equal(confirmedResponse.status, 200, JSON.stringify(confirmedPayload));
    assert.equal(confirmedPayload.result.ai_discovery.provider, 'AI_CHAT_CONFIRMED');
    assert.equal(confirmedPayload.result.ai_discovery.analysis.product_candidates[0].name, confirmed.name);
    assert.equal(confirmedPayload.result.ai_discovery.analysis.product_candidates[0].selected_by_user, true);
    assert.equal(rakutenCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('画像解析が失敗しても意味のある検索文ならライブモール検索を続ける', async () => {
  const originalFetch = globalThis.fetch;
  let rakutenCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) {
      return new Response('visual analysis unavailable', { status: 503 });
    }
    if (target.includes('openapi.rakuten.co.jp')) {
      rakutenCalls += 1;
      return Response.json({ items: [] });
    }
    return Response.json({ ok: true, result: {
      query_id: 'gas-image-text-fallback', candidates: [], message: ''
    } });
  };
  const env = {
    ...environment([]),
    GEMINI_API_KEY: 'g'.repeat(32),
    RAKUTEN_APPLICATION_ID: 'app',
    RAKUTEN_ACCESS_KEY: 'key'
  };
  try {
    const response = await worker.fetch(imageRequest('緑のバンダナを付けたパグのぬいぐるみ'), env, context);
    assert.equal(response.status, 200, await response.text());
    assert.ok(rakutenCalls >= 1, '画像解析失敗後もライブモール検索が必要');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public search API can return an ITG indexed result without an unapproved outbound URL', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('siteverify')
    ? Response.json({ success: true })
    : Response.json({ ok: true, result: { query_id: 'gas-q2', candidates: [], message: '' } });
  const row = {
    asin: 'B08RMZKYTL',
    product_name: 'Logitech G PRO X Superlight Wireless Gaming Mouse - Black',
    manufacturer: 'Logitech',
    image_url: 'https://images.example.test/mouse.jpg',
    stock: 5,
    amazon_jp_url: 'https://www.amazon.co.jp/dp/B08RMZKYTL',
    amazon_us_url: ''
  };
  try {
    const response = await worker.fetch(request('Logitech G PRO X Superlight ワイヤレスゲーミングマウス'), environment([row]), context);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.candidates[0].asin, row.asin);
    assert.equal(payload.result.candidates[0].tracking_url, '');
    assert.equal(payload.result.candidates[0].amazon_jp_url, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
