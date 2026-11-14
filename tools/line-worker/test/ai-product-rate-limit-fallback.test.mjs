import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { aiProductDiscoveryTest, discoverProductsWithAi } from '../src/ai-product-discovery.mjs';

const ENV = { GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32) };

beforeEach(() => aiProductDiscoveryTest.resetCircuitBreaker());

function geminiIntentResponse(name = 'Nothing Ear') {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify({
    category: '完全ワイヤレスイヤホン',
    intent_summary: '透明感のあるデザインのワイヤレスイヤホン',
    features: ['透明', 'ワイヤレス'],
    product_candidates: [{
      name,
      brand: name.split(' ')[0],
      match_score: 94,
      reason: '透明デザインが検索意図に一致',
      matched_features: ['透明', 'ワイヤレス'],
      search_keywords: [name, '透明 ワイヤレスイヤホン']
    }],
    search_keywords: ['透明 ワイヤレスイヤホン', 'スケルトン イヤホン'],
    multilingual_keywords: {
      ja: ['透明 イヤホン'],
      en: ['transparent earbuds'],
      zh: ['透明 无线耳机'],
      ko: ['투명 무선 이어폰']
    }
  }) }] } }] };
}

function openAiIntentResponse(name = '木製ローテーブル') {
  return { output: [{ type: 'message', content: [{
    type: 'output_text',
    text: JSON.stringify({
      category: 'ローテーブル',
      intent_summary: '木製の低いテーブル',
      features: ['木製', '低い'],
      product_candidates: [{ name, match_score: 90, reason: '商品カテゴリが一致', search_keywords: [name] }],
      search_keywords: [name, '木製 ローテーブル'],
      multilingual_keywords: { ja: [name], en: ['wood low table'], zh: [], ko: [] }
    })
  }] }] };
}

test('Gemini 429 immediately falls back to GPT product intent analysis', async () => {
  const providers = [];
  const result = await discoverProductsWithAi('ローテーブル', 'JA', ENV, async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      providers.push('gemini');
      return Response.json({ error: { status: 'too_many_requests' } }, { status: 429 });
    }
    if (String(url).includes('api.openai.com')) {
      providers.push('openai');
      return Response.json(openAiIntentResponse());
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  assert.deepEqual(providers, ['gemini', 'openai']);
  assert.equal(result.provider, 'OPENAI_PRODUCT_INTENT');
  assert.equal(result.model, 'gpt-5');
  assert.equal(result.analysis.product_candidates[0].name, '木製ローテーブル');
});

test('GPT runs when Gemini returns no candidates or keywords', async () => {
  const providers = [];
  const result = await discoverProductsWithAi('カットソー', 'JA', ENV, async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      providers.push('gemini');
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        category: '', features: [], product_candidates: [], search_keywords: [],
        multilingual_keywords: { ja: [], en: [], zh: [], ko: [] }
      }) }] } }] });
    }
    if (String(url).includes('api.openai.com')) {
      providers.push('openai');
      return Response.json(openAiIntentResponse('カットソー'));
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  assert.deepEqual(providers, ['gemini', 'openai']);
  assert.equal(result.provider, 'OPENAI_PRODUCT_INTENT');
  assert.equal(result.analysis.product_candidates.length, 1);
});

test('GPT is not called when Gemini provides product intent candidates', async () => {
  let openAiCalls = 0;
  const result = await discoverProductsWithAi('弁当の緑のしきり', 'JA', ENV, async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return Response.json(geminiIntentResponse('弁当用 バラン'));
    }
    if (String(url).includes('api.openai.com')) {
      openAiCalls += 1;
      return Response.json(openAiIntentResponse());
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  assert.equal(openAiCalls, 0);
  assert.equal(result.provider, 'GEMINI_PRODUCT_INTENT');
  assert.equal(result.analysis.product_candidates.length, 1);
  assert.equal(result.analysis.product_candidates[0].name, '弁当用 バラン');
});
