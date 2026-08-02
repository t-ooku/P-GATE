import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { aiProductDiscoveryTest, discoverProductsWithAi } from '../src/ai-product-discovery.mjs';

const ENV = { GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32) };

beforeEach(() => aiProductDiscoveryTest.resetCircuitBreaker());

function openAiProductResponse(productUrl) {
  return { output: [{ type: 'message', content: [{
    type: 'output_text',
    text: JSON.stringify({ products: [{ title: '木製ローテーブル', url: productUrl, reason: 'Exact product noun' }] }),
    annotations: [{ type: 'url_citation', url: productUrl, title: 'Low table' }]
  }] }] };
}

test('Gemini 429 immediately falls back to GPT web search', async () => {
  const productUrl = 'https://shop.example.test/products/low-table';
  const providers = [];
  const result = await discoverProductsWithAi('ローテーブル', 'JA', ENV, async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      providers.push('gemini');
      return Response.json({ error: { status: 'too_many_requests' } }, { status: 429 });
    }
    if (String(url).includes('api.openai.com')) {
      providers.push('openai');
      return Response.json(openAiProductResponse(productUrl));
    }
    return new Response('<meta property="og:type" content="product"><meta property="og:image" content="https://cdn.example.test/low-table.jpg">', { headers: { 'content-type': 'text/html' } });
  });
  assert.deepEqual(providers, ['gemini', 'openai']);
  assert.equal(result.provider, 'OPENAI_WEB_SEARCH');
  assert.equal(result.model, 'gpt-5.6-luna');
  assert.equal(result.candidates[0].url, productUrl);
});

test('GPT runs when Gemini returns no verified product candidate', async () => {
  const productUrl = 'https://shop.example.test/products/cut-sew';
  const providers = [];
  const result = await discoverProductsWithAi('カットソー', 'JA', ENV, async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      providers.push('gemini');
      return Response.json({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"products":[]}', annotations: [] }] }] });
    }
    if (String(url).includes('api.openai.com')) {
      providers.push('openai');
      return Response.json(openAiProductResponse(productUrl));
    }
    return new Response('<meta property="og:type" content="product"><meta property="og:image" content="https://cdn.example.test/cut-sew.jpg">', { headers: { 'content-type': 'text/html' } });
  });
  assert.deepEqual(providers, ['gemini', 'openai']);
  assert.equal(result.provider, 'OPENAI_WEB_SEARCH');
  assert.equal(result.candidates.length, 1);
});

test('GPT is not called when Gemini provides a verified product', async () => {
  const productUrl = 'https://shop.example.test/products/bento-baran';
  let openAiCalls = 0;
  const result = await discoverProductsWithAi('弁当の緑のしきり', 'JA', ENV, async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return Response.json({ steps: [{ type: 'model_output', content: [{
        type: 'text', text: JSON.stringify({ products: [{ title: 'バラン', url: productUrl }] }),
        annotations: [{ type: 'url_citation', url: productUrl, title: 'バラン' }]
      }] }] });
    }
    if (String(url).includes('api.openai.com')) {
      openAiCalls += 1;
      return Response.json(openAiProductResponse(productUrl));
    }
    return new Response('<meta property="og:type" content="product"><meta property="og:image" content="https://cdn.example.test/baran.jpg">', { headers: { 'content-type': 'text/html' } });
  });
  assert.equal(openAiCalls, 0);
  assert.equal(result.provider, 'GEMINI_GOOGLE_SEARCH');
  assert.equal(result.candidates.length, 1);
});
