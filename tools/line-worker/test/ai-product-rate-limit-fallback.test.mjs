import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverProductsWithAi } from '../src/ai-product-discovery.mjs';

test('Gemini discovery retries a stable model when the primary model is rate limited', async () => {
  const productUrl = 'https://shop.example.test/products/low-table';
  const models = [];
  const result = await discoverProductsWithAi('ローテーブル', 'JA', { GEMINI_API_KEY: 'g'.repeat(32) }, async (url, options = {}) => {
    if (String(url).includes('/v1beta/interactions')) {
      const model = JSON.parse(options.body).model;
      models.push(model);
      return Response.json({ error: { status: 'too_many_requests' } }, { status: 429 });
    }
    if (String(url).includes(':generateContent')) {
      models.push('gemini-2.5-flash');
      return Response.json({ candidates: [{
        content: { parts: [{ text: JSON.stringify({ products: [{ title: '木製ローテーブル', url: productUrl, reason: 'Exact product noun' }] }) }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: productUrl, title: 'Low table' } }] }
      }] });
    }
    return new Response('<meta property="og:type" content="product"><meta property="og:image" content="https://cdn.example.test/low-table.jpg">', { headers: { 'content-type': 'text/html' } });
  });
  assert.deepEqual(models, ['gemini-3.6-flash', 'gemini-2.5-flash']);
  assert.equal(result.model, 'gemini-2.5-flash');
  assert.equal(result.candidates[0].url, productUrl);
});
