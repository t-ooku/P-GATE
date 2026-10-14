import test from 'node:test';
import assert from 'node:assert/strict';
import { priceComparisonConfigured, requestAiPriceEstimates, requestAiCandidatePriceEstimates } from '../src/ai-price-comparison.mjs';
import { suggestRankingCategoriesWithAi } from '../src/marketplace-ranking.mjs';
import { resolveRelatedProductRecommendationQueries } from '../src/related-product-recommendations.mjs';

const paths = [
  ['comparison', (env, fetcher) => requestAiPriceEstimates({ title: 'test', language: 'JA' }, ['LOFT_JP'], env, fetcher)],
  ['candidate prices', (env, fetcher) => requestAiCandidatePriceEstimates([{ product_name: 'test', offers: [] }], env, fetcher)],
  ['ranking', (env, fetcher) => suggestRankingCategoriesWithAi(env, 'test', [{ value: 'test', label: 'test' }], fetcher)],
  ['related products', (env, fetcher) => resolveRelatedProductRecommendationQueries('未知の収納用品XYZ', 'JA', env, fetcher)]
];

for (const [name, invoke] of paths) {
  test(`${name}: missing/false OpenAI flag makes zero backup calls even after Gemini failure`, async () => {
    for (const flag of [undefined, '', 'false', 'FALSE']) {
      const env = { GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32), OPENAI_BACKUP_ENABLED: flag };
      let geminiCalls = 0;
      await invoke(env, async url => {
        assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/'));
        geminiCalls += 1;
        return new Response('', { status: 503 });
      });
      assert.equal(geminiCalls, 1);
      let disabledCalls = 0;
      await invoke({ OPENAI_API_KEY: env.OPENAI_API_KEY, OPENAI_BACKUP_ENABLED: flag }, async () => {
        disabledCalls += 1;
        return new Response('', { status: 503 });
      });
      assert.equal(disabledCalls, 0, 'disabled OpenAI-only configuration must not fetch');
    }
  });
}

test('an OpenAI key alone does not advertise price estimation as configured', () => {
  assert.equal(priceComparisonConfigured({ OPENAI_API_KEY: 'o'.repeat(32) }), false);
  assert.equal(priceComparisonConfigured({ OPENAI_API_KEY: 'o'.repeat(32), OPENAI_BACKUP_ENABLED: 'true' }), true);
});
