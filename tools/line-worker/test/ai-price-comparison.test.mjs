import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_ESTIMATE_DISCLAIMER, realPriceRows, comparableRealOffer, validateAiEstimates, buildPriceComparison,
  requestAiPriceEstimates, partitionOffersByProductIdentity, confidenceLabel,
  validateCandidatePriceEstimates, requestAiCandidatePriceEstimates, buildAiCheapestRanking
} from '../src/ai-price-comparison.mjs';
import { normalizeOffer } from '../src/hoshilu-product-schema.mjs';

// v4.3 指示書 Priority 3: AI最安比較。

test('v4.3項目13: realPriceRowsはIntegratedモールの実オファーのみを拾い、Directは無視する', () => {
  const ok = { shipping_fee_confirmed: true, shipping_fee: 0, stock_status: 'IN_STOCK' };
  const rows = realPriceRows([
    { ...ok, marketplace: 'AMAZON_JP', total_cost: 8980, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=a' },
    { ...ok, marketplace: 'RAKUTEN_JP', total_cost: 9180, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=b' },
    { ...ok, marketplace: 'LOFT_JP', total_cost: 8000, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=c' },
    { ...ok, marketplace: 'YAHOO_JP', total_cost: 0, currency: 'JPY', tracking_url: '' }
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows.map((row) => row.marketplace), ['RAKUTEN_JP']);
  assert.equal(rows[0].source, 'REAL');
});

// 2026-11-14 大隆さん「最安案内の実現指示書」: 送料不明・在庫切れ/不明・古い価格・リンクなしは最安の順位に入れない
test('最安案内: 送料が確かめられない・在庫が無い/分からない・古い・リンクが無い実オファーは比べない', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  const base = { marketplace: 'RAKUTEN_JP', total_cost: 1500, shipping_fee: 0, shipping_fee_confirmed: true, stock_status: 'IN_STOCK', tracking_url: 'https://hoshilu.app/go?token=x', observed_at: '2026-11-14T11:00:00Z' };
  assert.equal(comparableRealOffer(base, now), true);
  assert.equal(comparableRealOffer({ ...base, shipping_fee_confirmed: false }, now), false, '送料不明を0円にしない');
  assert.equal(comparableRealOffer({ ...base, stock_status: 'OUT_OF_STOCK' }, now), false, '在庫切れ');
  assert.equal(comparableRealOffer({ ...base, stock_status: 'UNKNOWN' }, now), false, '在庫不明');
  assert.equal(comparableRealOffer({ ...base, observed_at: '2026-11-12T11:00:00Z' }, now), false, '24時間より古い価格');
  assert.equal(comparableRealOffer({ ...base, tracking_url: '' }, now), false, '購入ページへのリンクが無い');
  assert.equal(comparableRealOffer({ ...base, marketplace: 'LOFT_JP' }, now), false, 'API連携していないモール');
  const rows = realPriceRows([base, { ...base, marketplace: 'YAHOO_JP', total_cost: 1200, shipping_fee_confirmed: false }], { now });
  assert.deepEqual(rows.map((row) => row.marketplace), ['RAKUTEN_JP'], '安く見えても送料不明なら勝者にしない');
  assert.equal(rows[0].observed_at, '2026-11-14T11:00:00.000Z');
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

test('v4.3項目16: 実価格同士なら「確認できた○モールの中で」と範囲つきで最安を言い、AI推定は最安の候補に名前を出さない', () => {
  const comparison = buildPriceComparison({
    real: [
      { marketplace: 'YAHOO_JP', total_cost: 8980 },
      { marketplace: 'RAKUTEN_JP', total_cost: 9180 }
    ],
    aiEstimates: [{ marketplace: 'LOFT_JP', range_min: 7000, range_max: 8500, confidence: 'MEDIUM' }],
    requestedDirectMarketplaces: ['LOFT_JP'],
    language: 'JA'
  });
  assert.equal(comparison.cheapest_claim.definitive, true);
  assert.equal(comparison.cheapest_claim.marketplace, 'YAHOO_JP');
  assert.equal(comparison.cheapest_claim.compared_count, 2);
  assert.equal(comparison.cheapest_claim.text, '送料込みの価格を確認できた2モールの中では、Yahoo!ショッピングが最安です。');
  // 2026-11-14 指示書 §4: AI推定・古い価格・検索リンクを最安の勝者にしない
  assert.equal(comparison.hedged_claim, null);
});

test('v4.3項目16: 実価格が1件も無ければ断定できる相手が無い(cheapest_claimはnull)', () => {
  const comparison = buildPriceComparison({
    real: [], aiEstimates: [{ marketplace: 'LOFT_JP', range_min: 7000, range_max: 8500, confidence: 'MEDIUM' }],
    requestedDirectMarketplaces: ['LOFT_JP'], language: 'JA'
  });
  assert.equal(comparison.cheapest_claim, null);
  assert.match(comparison.confirmed_price_note, /確認できたモールがないため、最安は出していません/);
});

test('実価格が1モールだけなら最安と断定せず、確認できたモールだけを案内する', () => {
  const comparison = buildPriceComparison({
    real: [{ marketplace: 'RAKUTEN_JP', total_cost: 1848 }],
    aiEstimates: [], requestedDirectMarketplaces: ['LOFT_JP'], language: 'JA'
  });
  assert.equal(comparison.cheapest_claim, null);
  assert.equal(comparison.confirmed_price_note, '比較未成立：送料込みの価格を確認できたのは楽天市場のみです。');
  assert.doesNotMatch(comparison.confirmed_price_note, /最安/);
});

test('v4.3項目9: GeminiとOpenAIを同時実行せず、Geminiが成功すればOpenAIは呼ばれない', async () => {
  let geminiCalls = 0;
  let openAiCalls = 0;
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, 'manual');
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
  const env = { GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32), OPENAI_BACKUP_ENABLED: 'true' };
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
  const env = { GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32), OPENAI_BACKUP_ENABLED: 'true' };
  const result = await requestAiPriceEstimates({ title: 'x', language: 'JA' }, ['LOFT_JP'], env, fetchImpl);
  assert.equal(result.unavailable, true);
  assert.deepEqual(result.estimates, []);
});

test('Geminiが一部だけ推定した場合は未取得モールだけOpenAIで補う', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const target = String(url);
    const prompt = target.includes('generativelanguage.googleapis.com')
      ? JSON.parse(options.body).contents[0].parts[0].text
      : JSON.parse(options.body).input;
    calls.push({ target, prompt, redirect: options.redirect });
    if (target.includes('generativelanguage.googleapis.com')) {
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        estimates: [{ marketplace: 'LOFT_JP', range_min: 1700, range_max: 2300, confidence: 'MEDIUM' }]
      }) }] } }] });
    }
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
      estimates: [{ marketplace: 'HANDS_JP', range_min: 1800, range_max: 2500, confidence: 'LOW' }]
    }) }] }] });
  };
  const result = await requestAiPriceEstimates(
    { title: 'LILY ANNA カラコン', referencePriceHint: 1848, language: 'JA' },
    ['LOFT_JP','HANDS_JP'],
    { GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32), OPENAI_BACKUP_ENABLED: 'true' },
    fetchImpl
  );
  assert.deepEqual(result.estimates.map((row) => row.marketplace), ['LOFT_JP','HANDS_JP']);
  assert.equal(result.provider, 'gemini+openai');
  assert.match(calls[0].prompt, /1848 JPY/);
  assert.doesNotMatch(calls[1].prompt, /LOFT_JP/);
  assert.match(calls[1].prompt, /HANDS_JP/);
  assert.ok(calls.every((call) => call.redirect === 'manual'));
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
