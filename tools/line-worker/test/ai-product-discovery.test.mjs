import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiProductDiscoveryConfigured,
  aiProductDiscoveryTest,
  discoverProductsWithAi,
  normalizeAiIntent,
  shouldGroundProductDiscovery
} from '../src/ai-product-discovery.mjs';

test('AI discovery accepts either Gemini or OpenAI configuration', () => {
  assert.equal(aiProductDiscoveryConfigured({}), false);
  assert.equal(aiProductDiscoveryConfigured({ GEMINI_API_KEY: 'g'.repeat(32) }), true);
  assert.equal(aiProductDiscoveryConfigured({ OPENAI_API_KEY: 'o'.repeat(32), OPENAI_BACKUP_ENABLED:'true' }), true);
  assert.equal(aiProductDiscoveryConfigured({ OPENAI_API_KEY: 'o'.repeat(32) }), false);
});

test('normalizes product candidates and multilingual search keywords', () => {
  const result = normalizeAiIntent({
    category: '完全ワイヤレスイヤホン',
    features: ['透明', 'クリア', '透明'],
    product_candidates: [{
      name: 'Nothing Ear',
      brand: 'Nothing',
      match_score: 97,
      reason: '透明デザインが近い',
      matched_features: ['透明', 'ワイヤレス'],
      search_keywords: ['Nothing Ear', '透明 イヤホン']
    }],
    search_keywords: ['透明 ワイヤレスイヤホン', 'クリア イヤホン'],
    multilingual_keywords: {
      en: ['transparent earbuds'],
      ko: ['투명 이어폰']
    }
  });
  assert.equal(result.category, '完全ワイヤレスイヤホン');
  assert.deepEqual(result.features, ['透明', 'クリア']);
  assert.equal(result.product_candidates[0].name, 'Nothing Ear');
  assert.equal(result.product_candidates[0].match_score, 97);
  assert.deepEqual(result.multilingual_keywords.en, ['transparent earbuds']);
});

test('Gemini returns candidate names and keywords without product URLs', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        category: '完全ワイヤレスイヤホン',
        intent_summary: '透明なケースと本体が見えるイヤホン',
        features: ['透明', 'スケルトン', 'ワイヤレス'],
        product_candidates: [
          { name: 'Nothing Ear', brand: 'Nothing', match_score: 96, reason: '透明デザイン', search_keywords: ['Nothing Ear'] },
          { name: 'TOZO Crystal Pods', brand: 'TOZO', match_score: 88, reason: '透明ケース', search_keywords: ['TOZO Crystal Pods'] }
        ],
        search_keywords: ['透明 ワイヤレスイヤホン', 'スケルトン イヤホン'],
        multilingual_keywords: { ja: ['透明 イヤホン'], en: ['transparent earbuds'], zh: [], ko: [] }
      }) }] } }]
    });
  };
  const result = await discoverProductsWithAi(
    '韓国っぽい透明のワイヤレスイヤホン',
    'JA',
    { GEMINI_API_KEY: 'g'.repeat(32), GEMINI_PRODUCT_DISCOVERY_MODEL: 'gemini-test' },
    fetchImpl
  );
  assert.equal(result.provider, 'GEMINI_PRODUCT_INTENT');
  assert.equal(result.analysis.product_candidates.length, 2);
  assert.equal(result.analysis.product_candidates[0].name, 'Nothing Ear');
  assert.deepEqual(result.candidates, []);
  assert.match(calls[0].url, /generateContent$/);
  const requestBody = JSON.parse(calls[0].options.body);
  assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
  assert.doesNotMatch(requestBody.contents[0].parts[0].text, /direct public product detail pages/i);
});

test('SNSで見た商品はGeminiのGoogle Searchで公開情報を確認する', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      category: 'マットレス', features: ['大きい'],
      product_candidates: [{ name: 'コアラマットレス', brand: 'Koala', match_score: 80, reason: '公開検索で確認した有力候補', search_keywords: ['コアラマットレス'] }],
      search_keywords: ['コアラマットレス'], multilingual_keywords: { ja: [], en: [], zh: [], ko: [] }
    }) }] } }] });
  };
  const result = await discoverProductsWithAi('インスタで見た、大きなマットレス', 'JA', {
    GEMINI_API_KEY: 'g'.repeat(32), GEMINI_PRODUCT_DISCOVERY_MODEL: 'gemini-test'
  }, fetchImpl);
  assert.equal(shouldGroundProductDiscovery('インスタで見た、大きなマットレス'), true);
  assert.deepEqual(calls[0].body.tools, [{ googleSearch: {} }]);
  assert.equal('responseMimeType' in calls[0].body.generationConfig, false);
  assert.equal(result.analysis.product_candidates[0].name, 'コアラマットレス');
});

test('falls back to OpenAI when Gemini fails', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    }
    return Response.json({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
        category: 'イヤホン',
        features: ['透明'],
        product_candidates: [{ name: 'SoundPEATS Clear', match_score: 85, reason: '透明デザイン' }],
        search_keywords: ['透明 イヤホン'],
        multilingual_keywords: { ja: [], en: ['clear earbuds'], zh: [], ko: [] }
      }) }] }]
    });
  };
  const result = await discoverProductsWithAi('透明イヤホン', 'JA', {
    GEMINI_API_KEY: 'g'.repeat(32),
    OPENAI_API_KEY: 'o'.repeat(32),
    OPENAI_BACKUP_ENABLED: 'true',
    OPENAI_PRODUCT_DISCOVERY_MODEL: 'gpt-test'
  }, fetchImpl);
  assert.equal(result.provider, 'OPENAI_PRODUCT_INTENT');
  assert.equal(result.analysis.product_candidates[0].name, 'SoundPEATS Clear');
});

test('OpenAI課金有効化フラグが無ければGemini失敗後にOpenAIへ接続しない', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return new Response('unavailable', { status:503 });
  };
  await assert.rejects(() => discoverProductsWithAi('韓国っぽいバッグ', 'JA', {
    GEMINI_API_KEY:'g'.repeat(32), OPENAI_API_KEY:'o'.repeat(32)
  }, fetchImpl), /GEMINI_PRODUCT_INTENT_FAILED/u);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /generativelanguage/u);
});

test('prompt explicitly requests candidate names and short marketplace terms', () => {
  const prompt = aiProductDiscoveryTest.providerPrompt('SNSで見た透明イヤホン', 'JA');
  assert.match(prompt, /Do not return URLs/);
  assert.match(prompt, /marketplace-friendly search terms/);
  assert.match(prompt, /product_candidates/);
});
