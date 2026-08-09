import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import worker from '../src/index.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

test('総合人気ランキング応答の直下に、価格根拠を分けたAI最安ランキングを返す', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('openapi.rakuten.co.jp/ichibaranking')) return Response.json({ Items: [
      { rank: 1, itemName: 'テスト ハンディファン', itemUrl: 'https://item.rakuten.co.jp/shop/item/', itemPrice: 2980, reviewAverage: 4.6, reviewCount: 300 }
    ] });
    throw new Error(`UNEXPECTED_FETCH:${target}`);
  };
  const request = new Request('https://hoshilu.app/api/hoshilu-rankings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'ハンディファン', consent: true, session_id: 'ranking_session_123456', turnstile_token: 'verified-token' })
  });
  try {
    const response = await worker.fetch(request, {
      TURNSTILE_SECRET_KEY: 'turnstile-secret', RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'access', LINK_SIGNING_SECRET: 'l'.repeat(32)
    }, { waitUntil() {} });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.ranking_type, 'HOSHILU総合人気ランキング（ベータ）');
    assert.equal(payload.result.ai_cheapest.ranking_type, 'AI最安ランキング（ベータ）');
    assert.equal(payload.result.ai_cheapest.candidates[0].ai_cheapest_price_source, 'OBSERVED_ITEM_PRICE');
    assert.equal(payload.result.ai_cheapest.candidates[0].ai_cheapest_price_min, 2980);
    assert.match(payload.result.ai_cheapest.disclaimer, /AI推定価格/);
  } finally { globalThis.fetch = originalFetch; }
});
