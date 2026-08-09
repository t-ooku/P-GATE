// v4.3 指示書 Priority 3: AI最安比較。
//
// HOSHILUの基本原則(section 10)「AIは理解する。HOSHILUは探す。」は通常検索
// では維持する。AI最安比較は section 11 で明示された唯一の例外 - この機能に
// 限り、AIによる価格「推定」を許可する。通常の商品カード・MATCHESには一切
// 影響しない(public/result-rows.mjs の「HOSHILUは価格を推測しません」は
// 無傷のまま)。
//
// 実価格(Integrated: Amazon/楽天/Yahoo!、既にHOSHILUが確認済み)と
// AI推定価格(Direct: それ以外のモール、AIが価格帯のみを推定)は、
// 呼び出し元(UI)が絶対に混同しないよう、このモジュールの出力は
// real/ai_estimated/unavailable の3つに明確に分離されている。

import { isIntegratedMarketplace } from './marketplace-search-mode.mjs';
import { matchProductIdentity } from './product-identity-matching.mjs';

// 2026-08-08 追記: 「AI推定価格です。実際の販売価格・在庫はショップで確認
// してください。」だけだと、この数字が何をもとにした推定なのかが伝わらない
// との指摘を受け、推定の根拠(該当モールの類似商品の価格情報)を明記する一文
// を追記した。既存文の先頭部分はそのまま残しているため、この文言に依存する
// 既存の正規表現アサーション(test/price-comparison-api.test.mjs,
// test/v4.3-regression-sections-32-34.test.mjs)は無傷で通る。
export const PRICE_ESTIMATE_DISCLAIMER = Object.freeze({
  JA: 'AI推定価格です。実際の販売価格・在庫はショップで確認してください。※該当モールの類似商品の価格情報をもとにした参考値です。',
  EN: 'This is an AI-estimated price. Please check the actual price and stock on the shop. *This is a reference value based on price information for similar products on that marketplace.',
  ZH: '这是AI推测价格。实际售价和库存请在商城确认。※该数值是根据该商城同类商品的价格信息推算的参考值。',
  KO: '이것은 AI 추정 가격입니다. 실제 판매 가격과 재고는 쇼핑몰에서 확인하세요. ※해당 쇼핑몰의 유사 상품 가격 정보를 바탕으로 한 참고값입니다.'
});

export const CONFIDENCE_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
const CONFIDENCE_LABELS = Object.freeze({
  JA: { HIGH: '高', MEDIUM: '中', LOW: '低' },
  EN: { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' },
  ZH: { HIGH: '高', MEDIUM: '中', LOW: '低' },
  KO: { HIGH: '높음', MEDIUM: '중간', LOW: '낮음' }
});

export function confidenceLabel(level, language = 'JA') {
  const labels = CONFIDENCE_LABELS[language] || CONFIDENCE_LABELS.JA;
  return labels[String(level || '').toUpperCase()] || null;
}

function cleanString(value, max = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// v4.3 section 19・20: 「別商品を価格比較してはいけない」。targetOfferと
// 同一商品と確定判定できたオファーだけをexact、それ以外(=判定不能だが
// 参考になり得る)はsimilarへ分ける。canonical productのグルーピング
// (hoshilu-product-normalizer.mjs)と同じ、AIを使わない決定的な判定のみ。
export function partitionOffersByProductIdentity(targetOffer, offers) {
  const exact = [];
  const similar = [];
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (offer === targetOffer) continue;
    const { matched } = matchProductIdentity(targetOffer, offer);
    (matched ? exact : similar).push(offer);
  }
  return { exact, similar };
}

// realOffers: candidate.offers 相当(price/shipping_fee/total_cost/marketplace
// を持つ、HOSHILUが既に確認済みの実オファー)。Integrated以外は無視する -
// Directモールの「実価格」は原理的に存在しない(HOSHILUがAPI連携していない)。
export function realPriceRows(realOffers) {
  return (Array.isArray(realOffers) ? realOffers : [])
    .filter((offer) => isIntegratedMarketplace(offer?.marketplace) && Number(offer?.total_cost) > 0)
    .map((offer) => ({
      marketplace: String(offer.marketplace),
      total_cost: Number(offer.total_cost),
      currency: String(offer.currency || 'JPY'),
      source: 'REAL',
      tracking_url: String(offer.tracking_url || '')
    }))
    .sort((a, b) => a.total_cost - b.total_cost);
}

// v4.3 section 14: AI推定価格は精密な数字ではなく価格帯にする。ここは
// プロンプト側での指示に加え、レスポンス側でも「範囲(min<max)」という形式を
// 構造的に要求する(単一の数字を書かせない)ことで、AIが精密な値を返した
// 場合でも仕組み上"範囲"にしかなり得ないようにする。
function estimatePrompt(context, marketplaces, language) {
  const { title, brand, category, referencePriceHint } = context;
  const hint = referencePriceHint
    ? `Reference: this product's confirmed real price on other marketplaces is around ${referencePriceHint} JPY (for grounding only - do not just copy this number).`
    : 'No confirmed real price is available for this product on any marketplace.';
  return `You are HOSHILU's price-range estimation assistant for shops HOSHILU cannot fetch real prices from.\n\nProduct: ${cleanString(title, 200)}\nBrand: ${cleanString(brand, 100) || 'unknown'}\nCategory: ${cleanString(category, 100) || 'unknown'}\n${hint}\nDisplay language: ${language}\n\nFor EACH of these shops, estimate a plausible price RANGE in Japanese Yen (never a single precise number):\n${marketplaces.map((m) => `- ${m}`).join('\n')}\n\nReturn JSON only with this exact structure:\n{\n  "estimates": [\n    { "marketplace": "", "range_min": 0, "range_max": 0, "confidence": "HIGH" }\n  ]\n}\n\nRules:\n- range_min must be strictly less than range_max (a real range, never range_min === range_max).\n- confidence must be one of HIGH, MEDIUM, LOW.\n- If you have no reasonable basis at all for a shop, OMIT that shop from "estimates" entirely - never invent a plausible-looking number just to fill it in.\n- Never claim this is a confirmed/real price - it is always a rough estimate.\n- JSON only, no markdown.`;
}

function parseJsonText(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
  try {
    return JSON.parse(fenced.trim());
  } catch {
    const object = fenced.match(/\{[\s\S]*\}/)?.[0];
    if (!object) return null;
    try { return JSON.parse(object); } catch { return null; }
  }
}

function geminiText(payload) {
  let text = '';
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (part?.text) text += `${part.text}\n`;
    }
  }
  return text.trim();
}

function openAiText(payload) {
  let text = '';
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message') continue;
    for (const block of Array.isArray(item.content) ? item.content : []) {
      if (block?.type === 'output_text') text += `${block.text || ''}\n`;
    }
  }
  return text.trim();
}

// AIの生レスポンスを検証し、範囲になっていない・数値が壊れているエントリは
// 「推定不能」として捨てる(=不確かな数字よりも「価格推定できません」の方が
// 誠実、section 17)。marketplacesに含まれない/重複したエントリも無視する。
export function validateAiEstimates(parsed, marketplaces) {
  const allowed = new Set(marketplaces);
  const seen = new Set();
  const estimates = [];
  for (const entry of Array.isArray(parsed?.estimates) ? parsed.estimates : []) {
    const marketplace = cleanString(entry?.marketplace, 30).toUpperCase();
    if (!allowed.has(marketplace) || seen.has(marketplace)) continue;
    const min = Number(entry?.range_min);
    const max = Number(entry?.range_max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min >= max) continue;
    const confidence = cleanString(entry?.confidence, 10).toUpperCase();
    seen.add(marketplace);
    estimates.push({
      marketplace,
      range_min: Math.round(min),
      range_max: Math.round(max),
      confidence: CONFIDENCE_LEVELS.includes(confidence) ? confidence : null
    });
  }
  return estimates;
}

export function validateCandidatePriceEstimates(parsed, allowedCandidateIndices) {
  const allowed = Number.isInteger(allowedCandidateIndices)
    ? new Set(Array.from({ length: allowedCandidateIndices }, (_, index) => index))
    : new Set(allowedCandidateIndices || []);
  const seen = new Set(); const estimates = [];
  for (const entry of Array.isArray(parsed?.estimates) ? parsed.estimates : []) {
    const candidateIndex = Number(entry?.candidate_index);
    const min = Number(entry?.range_min); const max = Number(entry?.range_max);
    if (!Number.isInteger(candidateIndex) || !allowed.has(candidateIndex) || seen.has(candidateIndex)) continue;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min >= max) continue;
    const confidence = cleanString(entry?.confidence, 10).toUpperCase();
    seen.add(candidateIndex);
    estimates.push({ candidate_index: candidateIndex, range_min: Math.round(min), range_max: Math.round(max), confidence: CONFIDENCE_LEVELS.includes(confidence) ? confidence : null });
  }
  return estimates;
}

function candidatePricePrompt(targets, language) {
  return `You are HOSHILU's cautious product price-range assistant. Estimate only products whose real price is unavailable.\nDisplay language: ${language}\nProducts:\n${targets.map(({ candidate, candidate_index: candidateIndex }) => `${candidateIndex}: ${cleanString(candidate.display_name || candidate.product_name, 200)} | brand=${cleanString(candidate.manufacturer, 100) || 'unknown'} | category=${cleanString(candidate.related_category, 100) || 'unknown'}`).join('\n')}\n\nReturn JSON only: {"estimates":[{"candidate_index":0,"range_min":0,"range_max":0,"confidence":"HIGH"}]}\nRules:\n- candidate_index must be copied from the product list above.\n- Give a broad Japanese-yen range, never a single exact price.\n- Omit a product if there is no reasonable basis.\n- Do not invent a seller, URL, stock, sale, or confirmed price.\n- confidence is HIGH, MEDIUM, or LOW.`;
}

async function providerFetch(fetchImpl, url, options, timeoutMs) {
  return fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

const ESTIMATE_TIMEOUT_MS = 20000;

async function callGemini(context, marketplaces, language, env, fetchImpl) {
  const model = String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash');
  const response = await providerFetch(
    fetchImpl,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: estimatePrompt(context, marketplaces, language) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    },
    ESTIMATE_TIMEOUT_MS
  );
  if (!response.ok) {
    const error = new Error('GEMINI_PRICE_ESTIMATE_FAILED');
    error.status = response.status;
    throw error;
  }
  const parsed = parseJsonText(geminiText(await response.json()));
  if (!parsed) throw new Error('GEMINI_PRICE_ESTIMATE_INVALID_JSON');
  return validateAiEstimates(parsed, marketplaces);
}

async function callOpenAi(context, marketplaces, language, env, fetchImpl) {
  const model = String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5');
  const response = await providerFetch(fetchImpl, 'https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: estimatePrompt(context, marketplaces, language),
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } }
    })
  }, ESTIMATE_TIMEOUT_MS);
  if (!response.ok) {
    const error = new Error('OPENAI_PRICE_ESTIMATE_FAILED');
    error.status = response.status;
    throw error;
  }
  const parsed = parseJsonText(openAiText(await response.json()));
  if (!parsed) throw new Error('OPENAI_PRICE_ESTIMATE_INVALID_JSON');
  return validateAiEstimates(parsed, marketplaces);
}

export function priceComparisonConfigured(env = {}) {
  return String(env.GEMINI_API_KEY || '').length >= 20 || String(env.OPENAI_API_KEY || '').length >= 20;
}

// v4.3 section 9: GeminiとOpenAIを同時実行しない。既存のai-chat-intent.mjs /
// ai-product-discovery.mjs と同じ、順番に1つずつ試す設計を踏襲する
// (このモジュールで3つ目の独立したprovider実装を増やすのではなく、同じ
// 呼び出し形を再利用する)。
export async function requestAiPriceEstimates(context, marketplaces, env = {}, fetchImpl = fetch) {
  if (!marketplaces.length || !priceComparisonConfigured(env)) return { estimates: [], provider: null };
  const geminiConfigured = String(env.GEMINI_API_KEY || '').length >= 20;
  const openAiConfigured = String(env.OPENAI_API_KEY || '').length >= 20;
  const providers = [geminiConfigured && 'gemini', openAiConfigured && 'openai'].filter(Boolean);
  const language = context.language || 'JA';

  let lastError;
  for (const provider of providers) {
    try {
      const estimates = provider === 'gemini'
        ? await callGemini(context, marketplaces, language, env, fetchImpl)
        : await callOpenAi(context, marketplaces, language, env, fetchImpl);
      return { estimates, provider };
    } catch (error) {
      lastError = error;
      console.warn('AI_PRICE_ESTIMATE_PROVIDER_FAILED', {
        provider, status: Number(error?.status || 0), provider_code: cleanString(error?.name || error?.message, 120)
      });
    }
  }
  console.warn('AI_PRICE_ESTIMATE_ALL_PROVIDERS_FAILED', { attempted: providers.length, had_error: Boolean(lastError) });
  return { estimates: [], provider: null, unavailable: true };
}

export async function requestAiCandidatePriceEstimates(candidates = [], env = {}, fetchImpl = fetch, language = 'JA') {
  const targets = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, candidateIndex) => ({ candidate, candidate_index: candidateIndex }))
    .filter(({ candidate }) => !observedCandidatePrice(candidate)).slice(0, 8);
  if (!targets.length || !priceComparisonConfigured(env)) return { estimates: [], provider: null };
  const prompt = candidatePricePrompt(targets, language);
  const providers = [String(env.GEMINI_API_KEY || '').length >= 20 && 'gemini', String(env.OPENAI_API_KEY || '').length >= 20 && 'openai'].filter(Boolean);
  for (const provider of providers) {
    try {
      const response = provider === 'gemini'
        ? await providerFetch(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash'))}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } })
        }, 6000)
        : await providerFetch(fetchImpl, 'https://api.openai.com/v1/responses', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5'), input: prompt, reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } } })
        }, 6000);
      if (!response.ok) continue;
      const payload = await response.json();
      const parsed = parseJsonText(provider === 'gemini' ? geminiText(payload) : openAiText(payload));
      const estimates = validateCandidatePriceEstimates(parsed, targets.map((target) => target.candidate_index));
      return { estimates, provider };
    } catch (error) {
      console.warn('AI_RANKING_PRICE_ESTIMATE_PROVIDER_FAILED', { provider, status: Number(error?.status || 0) });
    }
  }
  return { estimates: [], provider: null, unavailable: true };
}

function observedCandidatePrice(candidate = {}) {
  const rows = (Array.isArray(candidate.offers) ? candidate.offers : []).map((offer) => {
    const confirmedTotal = offer?.shipping_fee_confirmed === true || Number(offer?.shipping_fee_confirmed) === 1;
    const total = confirmedTotal ? Number(offer.total_cost) : 0;
    const itemPrice = Number(offer.price);
    if (total > 0) return { value: total, source: 'CONFIRMED_TOTAL' };
    if (itemPrice > 0) return { value: itemPrice, source: 'OBSERVED_ITEM_PRICE' };
    return null;
  }).filter(Boolean);
  return rows.sort((a, b) => a.value - b.value)[0] || null;
}

export function buildAiCheapestRanking(candidates = [], estimates = []) {
  const estimateByIndex = new Map(estimates.map((estimate) => [estimate.candidate_index, estimate]));
  return (Array.isArray(candidates) ? candidates : []).map((candidate, index) => {
    const observed = observedCandidatePrice(candidate);
    const estimate = estimateByIndex.get(index);
    if (observed) return { ...candidate, ai_cheapest_price_source: observed.source, ai_cheapest_price_min: observed.value, ai_cheapest_price_max: observed.value, ai_cheapest_sort_value: observed.value };
    if (estimate) return { ...candidate, ai_cheapest_price_source: 'AI_ESTIMATE', ai_cheapest_price_min: estimate.range_min, ai_cheapest_price_max: estimate.range_max, ai_cheapest_price_confidence: estimate.confidence, ai_cheapest_sort_value: (estimate.range_min + estimate.range_max) / 2 };
    return null;
  }).filter(Boolean)
    .sort((a, b) => {
      const priceDifference = a.ai_cheapest_sort_value - b.ai_cheapest_sort_value;
      if (priceDifference) return priceDifference;
      // 同額なら確認済み価格をAI推定より先にする。同じ種別同士は安定ソートに任せる。
      const aPriority = a.ai_cheapest_price_source === 'AI_ESTIMATE' ? 1 : 0;
      const bPriority = b.ai_cheapest_price_source === 'AI_ESTIMATE' ? 1 : 0;
      return aPriority - bPriority;
    })
    .map((candidate, index) => ({ ...candidate, ai_cheapest_rank: index + 1 }));
}

function marketplaceLabel(marketplace) {
  return String(marketplace || '').replace(/_JP$/, '');
}

// real/aiEstimatesを最終的な表示用データへ合成する純粋関数(通信なし)。
// v4.3 section 13・15・16: 実価格とAI推定を色/ラベルで区別できる形に分け、
// 「最安」の断定はreal同士でのみ許可し、AI推定を含む場合は必ずヘッジする。
export function buildPriceComparison({ real = [], aiEstimates = [], requestedDirectMarketplaces = [], searchLinks = [], language = 'JA' }) {
  const realRows = [...real].sort((a, b) => a.total_cost - b.total_cost);
  const searchLinkByMarketplace = new Map(searchLinks.map((item) => [item.marketplace, item]));
  const estimatedMarketplaces = new Set(aiEstimates.map((item) => item.marketplace));
  const aiRows = aiEstimates
    .map((item) => ({
      marketplace: item.marketplace,
      range_min: item.range_min,
      range_max: item.range_max,
      confidence: item.confidence,
      confidence_label: confidenceLabel(item.confidence, language),
      search_url: searchLinkByMarketplace.get(item.marketplace)?.url || '',
      search_query: searchLinkByMarketplace.get(item.marketplace)?.search_query || '',
      search_sort: searchLinkByMarketplace.get(item.marketplace)?.search_sort || '',
      source: 'AI_ESTIMATE'
    }))
    .sort((a, b) => a.range_min - b.range_min);
  // 依頼したのに推定できなかったモールは「価格推定できません」として明示する
  // (section 17: もっともらしい推定値を無理に表示せず、正直に不能と示す)。
  const unavailableRows = requestedDirectMarketplaces
    .filter((marketplace) => !estimatedMarketplaces.has(marketplace))
    .map((marketplace) => ({ marketplace, source: 'UNAVAILABLE' }));

  let cheapestClaim = null;
  if (realRows.length) {
    cheapestClaim = {
      definitive: true,
      marketplace: realRows[0].marketplace,
      text: {
        JA: `現在確認できた実価格では${marketplaceLabel(realRows[0].marketplace)}が最安です。`,
        EN: `Among confirmed real prices, ${marketplaceLabel(realRows[0].marketplace)} is currently the cheapest.`,
        ZH: `在已确认的实际价格中，${marketplaceLabel(realRows[0].marketplace)}目前最便宜。`,
        KO: `현재 확인된 실제 가격 중에서는 ${marketplaceLabel(realRows[0].marketplace)}가 가장 저렴합니다.`
      }[language] || null
    };
  }
  // AI推定側に、確定済みの最安実価格より安い可能性がある候補があれば、
  // 断定はせずヘッジした文言だけを別枠で添える(実価格の断定と混同させない)。
  const cheapestRealCost = realRows[0]?.total_cost ?? Infinity;
  const cheaperEstimate = aiRows.find((row) => row.range_min < cheapestRealCost);
  const hedgedClaim = cheaperEstimate ? {
    definitive: false,
    marketplace: cheaperEstimate.marketplace,
    text: {
      JA: `AI推定では${marketplaceLabel(cheaperEstimate.marketplace)}が安い可能性があります。`,
      EN: `Based on AI estimates, ${marketplaceLabel(cheaperEstimate.marketplace)} might be cheaper.`,
      ZH: `根据AI推测，${marketplaceLabel(cheaperEstimate.marketplace)}可能更便宜。`,
      KO: `AI 추정으로는 ${marketplaceLabel(cheaperEstimate.marketplace)}가 더 저렴할 수 있습니다.`
    }[language] || null
  } : null;

  return {
    real: realRows,
    ai_estimated: aiRows,
    unavailable: unavailableRows,
    cheapest_claim: cheapestClaim,
    hedged_claim: hedgedClaim,
    disclaimer_required: aiRows.length > 0,
    disclaimer_text: aiRows.length > 0 ? (PRICE_ESTIMATE_DISCLAIMER[language] || PRICE_ESTIMATE_DISCLAIMER.JA) : null
  };
}
