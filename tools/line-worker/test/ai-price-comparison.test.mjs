import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_ESTIMATE_DISCLAIMER, realPriceRows, validateAiEstimates, buildPriceComparison,
  requestAiPriceEstimates, partitionOffersByProductIdentity, confidenceLabel
} from '../src/ai-price-comparison.mjs';
import { normalizeOffer } from '../src/hoshilu-product-schema.mjs';

// v4.3 指示書 Priority 3: AI最安比較。

test('v4.3項目13: realPriceRowsはIntegratedモールの実オファーのみを拾い、Directは無視する', () => {
  const rows = realPriceRows([
    { marketplace: 'AMAZON_JP', total_cost: 8980, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=a' },
    { marketplace: 'RAKUTEN_JP', total_cost: 9180, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=b' },
    { marketplace: 'LOFT_JP', total_cost: 8000, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=c' },
    { marketplace: 'YAHOO_JP', total_cost: 0, currency: 'JPY', tracking_url: '' }
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.marketplace), ['AMAZON_JP', 'RAKUTEN_JP']);
  assert.equal(rows[0].source, 'REAL');
});

test('v4.3項目14: AI推定は範囲(min<max)のみ許可し、単一の精密な数字は拒否する', () => {
  const estimates = validateAiEstimates({
    estimates: [
      { marketplace: 'LOFT_JP', range_min: 8000, range_max: 10000, confidence: 'HIGH' },
      { marketplace: 'HANDS_JP', range_min: 9000, range_max: 9000, confidence: 'MEDIUM' }, // min===max -> 拒否
      { marketplace: 'MATSUKIYO_JP', range_min: -100, range_max: 500, confidence: 'LOW' }, // 負値 -> 拒否
      { marketplace: 'UNKNOWN_MALL', range_min: 100, range_max: 200, confidence: 'HIGH' } // 依頼していないモール -> 拒否
    ]
  }, ['LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP']);
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0].marketplace, 'LOFT_JP');
  assert.equal(estimates[0].range_min, 8000);
  assert.equal(estimates[0].range_max, 10000);
  assert.equal(estimates[0].confidence, 'HIGH');
});

test('v4.3項目17: 依頼したモールの一部しか推定できなくても、無理に埋めず「推定不能」として扱う', () => {
  const comparison = buildPriceComparison({
    real: [],
    aiEstimates: [{ marketplace: 'LOFT_JP', range_min: 8000, range_max: 10000, confidence: 'HIGH' }],
    requestedDirectMarketplaces: ['LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP'],
    language: 'JA'
  });
  assert.equal(comparison.ai_estimated.length, 1);
  assert.deepEqual(comparison.unavailable.map((row) => row.marketplace).sort(), ['HANDS_JP', 'MATSUKIYO_JP']);
  assert.equal(comparison.unavailable[0].source, 'UNAVAILABLE');
});

test('v4.3項目15: AI推定が1件でもあれば、必須の注意書きが付く', () => {
  const withAi = buildPriceComparison({
    real: [], aiEstimates: [{ marketplace: 'LOFT_JP', range_min: 8000, range_max: 10000, confidence: 'HIGH' }],
    requestedDirectMarketplaces: ['LOFT_JP'], language: 'JA'
  });
  assert.equal(withAi.disclaimer_required, true);
  assert.equal(withAi.disclaimer_text, PRICE_ESTIMATE_DISCLAIMER.JA);
  const withoutAi = buildPriceComparison({ real: [{ marketplace: 'AMAZON_JP', total_cost: 100 }], aiEstimates: [], requestedDirectMarketplaces: [], language: 'JA' });
  assert.equal(withoutAi.disclaimer_required, false);
  assert.equal(withoutAi.disclaimer_text, null);
});

test('v4.3項目16: 実価格同士なら断定できるが、AI推定を含む場合は断定せずヘッジする', () => {
  const comparison = buildPriceComparison({
    real: [
      { marketplace: 'AMAZON_JP', total_cost: 8980 },
      { marketplace: 'RAKUTEN_JP', total_cost: 9180 }
    ],
    aiEstimates: [{ marketplace: 'LOFT_JP', range_min: 7000, range_max: 8500, confidence: 'MEDIUM' }],
    requestedDirectMarketplaces: ['LOFT_JP'],
    language: 'JA'
  });
  // 実価格同士の断定は許可(AMAZONが最安)
  assert.equal(comparison.cheapest_claim.definitive, true);
  assert.equal(comparison.cheapest_claim.marketplace, 'AMAZON_JP');
  assert.match(comparison.cheapest_claim.text, /最安/);
  // AI推定(ロフト:7000-8500)がAmazonの実価格(8980)より安い可能性があるので、
  // 断定ではなくヘッジされた文言が別枠で付く
  assert.equal(comparison.hedged_claim.definitive, false);
  assert.equal(comparison.hedged_claim.marketplace, 'LOFT_JP');
  assert.match(comparison.hedged_claim.text, /可能性があります/);
  assert.doesNotMatch(comparison.hedged_claim.text, /最安です。$/);
});

test('v4.3項目16: 実価格が1件も無ければ断定できる相手が無い(cheapest_claimはnull)', () => {
  const comparison = buildPriceComparison({
    real: [], aiEstimates: [{ marketplace: 'LOFT_JP', range_min: 7000, range_max: 8500, confidence: 'MEDIUM' }],
    requestedDirectMarketplaces: ['LOFT_JP'], language: 'JA'
  });
  assert.equal(comparison.cheapest_claim, null);
});

test('v4.3項目9: GeminiとOpenAIを同時実行せず、Geminiが成功すればOpenAIは呼ばれない', async () => {
  let geminiCalls = 0;
  let openAiCalls = 0;
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('generativelanguage.googleapis.com')) {
      geminiCalls += 1;
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        estimates: [{ marketplace: 'LOFT_JP', range_min: 8000, range_max: 10000, confidence: 'HIGH' }]
      }) }] } }] });
    }
    if (target.includes('api.openai.com')) { openAiCalls += 1; return Response.json({ output: [] }); }
    throw new Error('UNEXPECTED_FETCH');
  };
  const env = { GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32) };
  const result = await requestAiPriceEstimates(
    { title: 'ハンディファン', brand: 'HOSHILU', category: '家電', language: 'JA' },
    ['LOFT_JP'], env, fetchImpl
  );
  assert.equal(geminiCalls, 1);
  assert.equal(openAiCalls, 0);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.estimates[0].marketplace, 'LOFT_JP');
});

test('v4.3項目9: AIプロバイダが両方とも失敗すればunavailable:trueで空配列を返す(例外を投げない)', async () => {
  const fetchImpl = async () => new Response('down', { status: 503 });
  const env = { GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32) };
  const result = await requestAiPriceEstimates({ title: 'x', language: 'JA' }, ['LOFT_JP'], env, fetchImpl);
  assert.equal(result.unavailable, true);
  assert.deepEqual(result.estimates, []);
});

test('v4.3項目19・20: 同一商品と判定できないオファーはsimilarへ分離される', () => {
  const target = normalizeOffer({ source_product_id: 'A', brand: 'HOSHILU', title: 'ハンディファン ホワイト', jan: '4900000000010', updated_at: '2026-08-08T00:00:00Z' }, { sourceMarketplace: 'AMAZON_JP' });
  const same = normalizeOffer({ source_product_id: 'B', brand: 'HOSHILU', title: 'ハンディファン ホワイト', jan: '4900000000010', updated_at: '2026-08-08T00:00:00Z' }, { sourceMarketplace: 'RAKUTEN_JP' });
  const different = normalizeOffer({ source_product_id: 'C', brand: 'OTHER', title: '全く違う商品', updated_at: '2026-08-08T00:00:00Z' }, { sourceMarketplace: 'LOFT_JP' });
  const { exact, similar } = partitionOffersByProductIdentity(target, [same, different]);
  assert.equal(exact.length, 1);
  assert.equal(exact[0].source_marketplace, 'RAKUTEN_JP');
  assert.equal(similar.length, 1);
  assert.equal(similar[0].source_marketplace, 'LOFT_JP');
});

test('confidenceLabel: 高/中/低へ変換される', () => {
  assert.equal(confidenceLabel('HIGH', 'JA'), '高');
  assert.equal(confidenceLabel('MEDIUM', 'JA'), '中');
  assert.equal(confidenceLabel('LOW', 'JA'), '低');
  assert.equal(confidenceLabel(null, 'JA'), null);
});
