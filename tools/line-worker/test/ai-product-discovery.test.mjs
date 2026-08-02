import test from 'node:test';
import assert from 'node:assert/strict';
import { aiProductDiscoveryConfigured, aiProductDiscoveryTest, discoverProductsWithAi } from '../src/ai-product-discovery.mjs';

test('AI discovery requires a configured Gemini key', () => {
  assert.equal(aiProductDiscoveryConfigured({}), false);
  assert.equal(aiProductDiscoveryConfigured({ GEMINI_API_KEY: 'g'.repeat(32) }), true);
});

test('AI discovery returns only cited product pages with an image', async () => {
  const productUrl = 'https://shop.example.test/products/light-case';
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/v1beta/interactions')) {
      return Response.json({ steps: [{ type: 'model_output', content: [{
        type: 'text',
        text: JSON.stringify({ products: [{ title: 'Notification light phone case', url: productUrl, reason: 'The back lights up.' }] }),
        annotations: [{ type: 'url_citation', url: productUrl, title: 'Example shop' }]
      }] }] });
    }
    return new Response('<html><head><meta property="og:type" content="product"><meta property="og:title" content="Light Case"><meta property="og:image" content="https://cdn.example.test/light-case.jpg"></head><body><button>Add to cart</button></body></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  };
  const result = await discoverProductsWithAi('TikTokで見た光るスマホケース', 'JA', { GEMINI_API_KEY: 'g'.repeat(32) }, fetchImpl);
  assert.equal(result.triggered, true);
  assert.equal(result.provider, 'GEMINI_GOOGLE_SEARCH');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, productUrl);
  assert.equal(result.candidates[0].image, 'https://cdn.example.test/light-case.jpg');
  assert.equal(result.candidates[0].verification, 'AI_DISCOVERY_UNCONFIRMED');
  assert.equal(calls.length, 2);
});

test('AI discovery drops hallucinated uncited URLs and private destinations', async () => {
  const fetchImpl = async () => Response.json({ steps: [{ type: 'model_output', content: [{
    type: 'text', text: JSON.stringify({ products: [{ title: 'Fake', url: 'https://fake.example.test/products/1' }] }),
    annotations: [{ type: 'url_citation', url: 'https://real.example.test/products/1', title: 'Real' }]
  }] }] });
  const result = await discoverProductsWithAi('unknown item', 'EN', { GEMINI_API_KEY: 'g'.repeat(32) }, fetchImpl);
  assert.deepEqual(result.candidates, []);
  assert.equal(aiProductDiscoveryTest.safePublicHttpsUrl('http://example.test/item'), '');
  assert.equal(aiProductDiscoveryTest.safePublicHttpsUrl('https://127.0.0.1/item'), '');
  assert.equal(aiProductDiscoveryTest.safePublicHttpsUrl('https://[::1]/item'), '');
  assert.equal(aiProductDiscoveryTest.safePublicHttpsUrl('https://hoshilu.app/item'), '');
});
