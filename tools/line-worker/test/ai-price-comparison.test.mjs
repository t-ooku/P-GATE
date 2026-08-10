import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_ESTIMATE_DISCLAIMER, realPriceRows, validateAiEstimates, buildPriceComparison,
  requestAiPriceEstimates, partitionOffersByProductIdentity, confidenceLabel,
  validateCandidatePriceEstimates, requestAiCandidatePriceEstimates, buildAiCheapestRanking
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
  assert.equal(rows.length, 1);
  assert.deepEqual(rows.map((row) => row.marketplace), ['RAKUTEN_JP']);
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
  const withoutAi = buildPriceComparison({ real: [{ marketplace: 'RAKUTEN_JP', total_cost: 100 }], aiEstimates: [], requestedDirectMarketplaces: [], language: 'JA' });
  assert.equal(withoutAi.disclaimer_required, false);
  assert.equal(withoutAi.disclaimer_text, null);
});

test('v4.3項目16: 実価格同士なら断定できるが、AI推定を含む場合は断定せずヘッジする', () => {
  const comparison = buildPriceComparison({
    real: [
      { marketplace: 'YAHOO_JP', total_cost: 8980 },
      { marketplace: 'RAKUTEN_JP', total_cost: 9180 }
    ],
    aiEstimates: [{ marketplace: 'LOFT_JP', range_min: 7000, range_max: 8500, confidence: 'MEDIUM' }],
    requestedDirectMarketplaces: ['LOFT_JP'],
    language: 'JA'
  });
  // 実価格同士の断定は許可(Yahoo!が最安)
  assert.equal(comparison.cheapest_claim.definitive, true);
  assert.equal(comparison.cheapest_claim.marketplace, 'YAHOO_JP');
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

test('AI最安ランキングは実価格・商品価格・AI推定価格帯を混同せず参考値で並べる', () => {
  const candidates = [
    { product_name: '送料込み商品', offers: [{ price: 3000, total_cost: 3300, shipping_fee_confirmed: true }] },
    { product_name: '価格不明商品', offers: [] },
    { product_name: '送料未確認商品', offers: [{ price: 2500, total_cost: 0, shipping_fee_confirmed: false }] }
  ];
  const ranked = buildAiCheapestRanking(candidates, [{ candidate_index: 1, range_min: 1800, range_max: 2200, confidence: 'MEDIUM' }]);
  assert.deepEqual(ranked.map((item) => item.product_name), ['価格不明商品', '送料未確認商品', '送料込み商品']);
  assert.equal(ranked[0].ai_cheapest_price_source, 'AI_ESTIMATE');
  assert.equal(ranked[1].ai_cheapest_price_source, 'OBSERVED_ITEM_PRICE');
  assert.equal(ranked[2].ai_cheapest_price_source, 'CONFIRMED_TOTAL');
  assert.deepEqual(ranked.map((item) => item.ai_cheapest_rank), [1, 2, 3]);
});

test('AI最安ランキングは同額なら確認済み価格をAI推定より優先し同種別の順序を保つ', () => {
  const ranked = buildAiCheapestRanking([
    { product_name: '実価格A', offers: [{ price: 2000 }] },
    { product_name: '推定価格', offers: [] },
    { product_name: '実価格B', offers: [{ price: 2000 }] }
  ], [{ candidate_index: 1, range_min: 1500, range_max: 2500, confidence: 'LOW' }]);
  assert.deepEqual(ranked.map((item) => item.product_name), ['実価格A', '実価格B', '推定価格']);
});

test('ランキング価格AIは価格不明商品のみ最大8件を1回で推定する', async () => {
  let calls = 0; let prompt = '';
  const result = await requestAiCandidatePriceEstimates([
    { product_name: '実価格あり', offers: [{ price: 1000 }] },
    { product_name: '価格不明A', offers: [] },
    { product_name: '価格不明B', offers: [] }
  ], { GEMINI_API_KEY: 'g'.repeat(32) }, async (_url, init) => {
    calls += 1; prompt = JSON.parse(init.body).contents[0].parts[0].text;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ estimates: [
      { candidate_index: 1, range_min: 2000, range_max: 3000, confidence: 'LOW' },
      { candidate_index: 0, range_min: 1, range_max: 2, confidence: 'HIGH' }
    ] }) }] } }] });
  });
  assert.equal(calls, 1);
  assert.doesNotMatch(prompt, /実価格あり/);
  assert.match(prompt, /1: 価格不明A/);
  assert.deepEqual(result.estimates.map((item) => item.candidate_index), [1]);
});

test('ランキング価格帯は許可された候補番号と幅のある正数だけを受理する', () => {
  const result = validateCandidatePriceEstimates({ estimates: [
    { candidate_index: 4, range_min: 1000, range_max: 2000, confidence: 'HIGH' },
    { candidate_index: 1, range_min: 1000, range_max: 1000, confidence: 'MEDIUM' },
    { candidate_index: 9, range_min: 1000, range_max: 2000, confidence: 'LOW' }
  ] }, [1, 4]);
  assert.deepEqual(result, [{ candidate_index: 4, range_min: 1000, range_max: 2000, confidence: 'HIGH' }]);
});
