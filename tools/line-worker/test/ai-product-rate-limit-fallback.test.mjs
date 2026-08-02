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
      if (model === 'gemini-3.6-flash') return Response.json({ error: { status: 'too_many_requests' } }, { status: 429 });
      return Response.json({ steps: [{ type: 'model_output', content: [{
        type: 'text', text: JSON.stringify({ products: [{ title: '木製ローテーブル', url: productUrl, reason: 'Exact product noun' }] }),
        annotations: [{ type: 'url_citation', url: productUrl, title: 'Low table' }]
      }] }] });
    }
    return new Response('<meta property="og:type" content="product"><meta property="og:image" content="https://cdn.example.test/low-table.jpg">', { headers: { 'content-type': 'text/html' } });
  });
  assert.deepEqual(models, ['gemini-3.6-flash', 'gemini-2.5-flash']);
  assert.equal(result.model, 'gemini-2.5-flash');
  assert.equal(result.candidates[0].url, productUrl);
});
