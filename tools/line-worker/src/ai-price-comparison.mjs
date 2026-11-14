// v4.3 指示書 Priority 3: AI最安比較。
//
// HOSHILUの基本原則(section 10)「AIは理解する。HOSHILUは探す。」は通常検索
// では維持する。AI最安比較は section 11 で明示された唯一の例外 - この機能に
// 限り、AIによる価格「推定」を許可する。通常の商品カード・MATCHESには一切
// 影響しない(public/result-rows.mjs の「HOSHILUは価格を推測しません」は
// 無傷のまま)。
//
// 実価格(Integrated: 楽天/Yahoo!、既にHOSHILUが確認済み)と
// AI推定価格(Direct: それ以外のモール、AIが価格帯のみを推定)は、
// 呼び出し元(UI)が絶対に混同しないよう、このモジュールの出力は
// real/ai_estimated/unavailable の3つに明確に分離されている。

import { isIntegratedMarketplace } from './marketplace-search-mode.mjs';
import { matchProductIdentity } from './product-identity-matching.mjs';
import { openAiBackupEnabled } from './ai-provider-availability.mjs';

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
// 2026-11-14 大隆さん「最安案内の実現指示書」§3・§4: 根拠のない最安を出さない。
// 比べてよいのは、送料込みの支払額が確かめられ(送料不明を0円にしない)、在庫あり、
// 商品ページへのリンクがあり、確認から REAL_PRICE_MAX_AGE_MS 以内の実オファーだけ。
// どれか1つでも欠けたら順位付けに入れない(画面には「比較できた範囲」だけを出す)。
export const REAL_PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export function comparableRealOffer(offer, now = Date.now()) {
  if (!isIntegratedMarketplace(offer?.marketplace)) return false;
  if (!(Number(offer?.total_cost) > 0)) return false;
  if (!(offer?.shipping_fee_confirmed === true || Number(offer?.shipping_fee_confirmed) === 1)) return false;
  if (String(offer?.stock_status || '').toUpperCase() !== 'IN_STOCK') return false;
  if (!/^https:\/\//iu.test(String(offer?.tracking_url || ''))) return false;
  const observed = Date.parse(String(offer?.observed_at || ''));
  if (Number.isFinite(observed) && now - observed > REAL_PRICE_MAX_AGE_MS) return false;
  return true;
}

export function realPriceRows(realOffers, { now = Date.now() } = {}) {
  return (Array.isArray(realOffers) ? realOffers : [])
    .filter((offer) => comparableRealOffer(offer, now))
    .map((offer) => ({
      marketplace: String(offer.marketplace),
      total_cost: Number(offer.total_cost),
      shipping_fee: Number(offer.shipping_fee) >= 0 ? Number(offer.shipping_fee) : null,
      currency: String(offer.currency || 'JPY'),
      ...(Number.isFinite(Date.parse(String(offer.observed_at || ''))) ? { observed_at: new Date(offer.observed_at).toISOString() } : {}),
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
  return fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
}

// 価格比較は購入直前の操作なので、長いAI待機を許容しない。Geminiを4.5秒、
// 障害時のOpenAIを3.5秒に制限し、両方失敗しても実価格と検索リンクは返す。
const GEMINI_ESTIMATE_TIMEOUT_MS = 4500;
const OPENAI_ESTIMATE_TIMEOUT_MS = 3500;

async function callGemini(context, marketplaces, language, env, fetchImpl) {
  // 価格比較は短時間応答が必要なので、専用指定が無ければ実際の検索語変換
  // でも使う軽量モデルを優先する。PRODUCT_DISCOVERY_MODELは長い生成向けの
  // 設定で、価格比較の4.5秒上限と合わない場合がある。
  const model = String(env.GEMINI_PRICE_COMPARISON_MODEL || env.GEMINI_QUERY_REFINEMENT_MODEL || env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.1-flash-lite');
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
    GEMINI_ESTIMATE_TIMEOUT_MS
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
  const model = String(env.OPENAI_PRICE_COMPARISON_MODEL || env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5');
  const response = await providerFetch(fetchImpl, 'https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: estimatePrompt(context, marketplaces, language),
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } }
    })
  }, OPENAI_ESTIMATE_TIMEOUT_MS);
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
  return String(env.GEMINI_API_KEY || '').length >= 20 || openAiBackupEnabled(env);
}

// v4.3 section 9: GeminiとOpenAIを同時実行しない。既存のai-chat-intent.mjs /
// ai-product-discovery.mjs と同じ、順番に1つずつ試す設計を踏襲する
// (このモジュールで3つ目の独立したprovider実装を増やすのではなく、同じ
// 呼び出し形を再利用する)。
export async function requestAiPriceEstimates(context, marketplaces, env = {}, fetchImpl = fetch) {
  if (!marketplaces.length || !priceComparisonConfigured(env)) return { estimates: [], provider: null };
  const geminiConfigured = String(env.GEMINI_API_KEY || '').length >= 20;
  const openAiConfigured = openAiBackupEnabled(env);
  const providers = [geminiConfigured && 'gemini', openAiConfigured && 'openai'].filter(Boolean);
  const language = context.language || 'JA';

  let lastError;
  const estimates = [];
  const completed = new Set();
  const usedProviders = [];
  for (const provider of providers) {
    const pending = marketplaces.filter((marketplace) => !completed.has(marketplace));
    if (!pending.length) break;
    try {
      const rows = provider === 'gemini'
        ? await callGemini(context, pending, language, env, fetchImpl)
        : await callOpenAi(context, pending, language, env, fetchImpl);
      // 有効なJSONでも空配列や一部モールだけの回答になることがある。その時に
      // 成功扱いで即終了すると、残りが全て「推定不能」になるため、未取得分だけ
      // 次の設定済みプロバイダへ渡す。
      if (rows.length) usedProviders.push(provider);
      for (const row of rows) {
        if (completed.has(row.marketplace)) continue;
        completed.add(row.marketplace);
        estimates.push(row);
      }
    } catch (error) {
      lastError = error;
      console.warn('AI_PRICE_ESTIMATE_PROVIDER_FAILED', {
        provider, status: Number(error?.status || 0), provider_code: cleanString(error?.name || error?.message, 120)
      });
    }
  }
  if (estimates.length) return { estimates, provider: usedProviders.join('+') || null };
  console.warn('AI_PRICE_ESTIMATE_ALL_PROVIDERS_FAILED', { attempted: providers.length, had_error: Boolean(lastError) });
  return { estimates: [], provider: null, unavailable: true };
}

export async function requestAiCandidatePriceEstimates(candidates = [], env = {}, fetchImpl = fetch, language = 'JA') {
  const targets = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, candidateIndex) => ({ candidate, candidate_index: candidateIndex }))
    .filter(({ candidate }) => !observedCandidatePrice(candidate)).slice(0, 8);
  if (!targets.length || !priceComparisonConfigured(env)) return { estimates: [], provider: null };
  const prompt = candidatePricePrompt(targets, language);
  const providers = [String(env.GEMINI_API_KEY || '').length >= 20 && 'gemini', openAiBackupEnabled(env) && 'openai'].filter(Boolean);
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

function marketplaceLabel(marketplace, language = 'JA') {
  const code = String(marketplace || '').toUpperCase();
  const labels = {
    JA: { RAKUTEN_JP:'楽天市場', YAHOO_JP:'Yahoo!ショッピング', AMAZON_JP:'Amazon', LOFT_JP:'ロフト', HANDS_JP:'ハンズ', MATSUKIYO_JP:'マツキヨ', COSME_JP:'@cosme', QOO10_JP:'Qoo10', ZOZOTOWN_JP:'ZOZOTOWN' },
    EN: { RAKUTEN_JP:'Rakuten', YAHOO_JP:'Yahoo! Shopping' },
    ZH: { RAKUTEN_JP:'乐天市场', YAHOO_JP:'Yahoo!购物' },
    KO: { RAKUTEN_JP:'라쿠텐', YAHOO_JP:'Yahoo! 쇼핑' }
  };
  return labels[language]?.[code] || labels.JA[code] || code.replace(/_JP$/, '');
}

// real/aiEstimatesを最終的な表示用データへ合成する純粋関数(通信なし)。
// v4.3 section 13・15・16: 実価格とAI推定を色/ラベルで区別できる形に分け、
// 「最安」の断定はreal同士でのみ許可し、AI推定を含む場合は必ずヘッジする。
export function buildPriceComparison({ real = [], aiEstimates = [], requestedDirectMarketplaces = [], searchLinks = [], language = 'JA' }) {
  const searchLinkByMarketplace = new Map(searchLinks.map((item) => [item.marketplace, item]));
  const withSearchLink = (item) => ({
    ...item,
    search_url: searchLinkByMarketplace.get(item.marketplace)?.url || '',
    search_query: searchLinkByMarketplace.get(item.marketplace)?.search_query || '',
    search_sort: searchLinkByMarketplace.get(item.marketplace)?.search_sort || ''
  });
  const realRows = [...real].map(withSearchLink).sort((a, b) => a.total_cost - b.total_cost);
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
    .map((marketplace) => withSearchLink({ marketplace, source: 'UNAVAILABLE' }));

  // 2026-11-14 指示書 §4: 最安は「確認できた○店の中で」と範囲を必ず書く。1店だけなら「比較未成立」、
  // 0店ならその旨。AI推定は最安の候補として名前を出さない(hedged_claim は常に null)。
  let cheapestClaim = null;
  let confirmedPriceNote = null;
  const count = realRows.length;
  if (count >= 2) {
    const name = marketplaceLabel(realRows[0].marketplace, language);
    cheapestClaim = {
      definitive: true,
      marketplace: realRows[0].marketplace,
      compared_count: count,
      text: {
        JA: `送料込みの価格を確認できた${count}モールの中では、${name}が最安です。`,
        EN: `Among the ${count} marketplaces with a confirmed total including shipping, ${name} is the cheapest.`,
        ZH: `在已确认含运费价格的${count}个商城中，${name}最便宜。`,
        KO: `배송비 포함 가격이 확인된 ${count}개 쇼핑몰 중에서는 ${name}가 가장 저렴합니다.`
      }[language] || null
    };
  } else if (count === 1) {
    const name = marketplaceLabel(realRows[0].marketplace, language);
    confirmedPriceNote = {
      JA: `比較未成立：送料込みの価格を確認できたのは${name}のみです。`,
      EN: `No comparison yet: ${name} is the only marketplace with a confirmed total including shipping.`,
      ZH: `尚未形成比较：目前只有${name}确认了含运费价格。`,
      KO: `비교 불가: 배송비 포함 가격이 확인된 곳은 ${name}뿐입니다.`
    }[language] || null;
  } else {
    confirmedPriceNote = {
      JA: '送料込みの価格を確認できたモールがないため、最安は出していません。',
      EN: 'No marketplace has a confirmed total including shipping, so no cheapest store is shown.',
      ZH: '没有商城确认了含运费价格，因此不显示最便宜的商城。',
      KO: '배송비 포함 가격이 확인된 쇼핑몰이 없어 최저가를 표시하지 않습니다.'
    }[language] || null;
  }
  const hedgedClaim = null;

  return {
    real: realRows,
    ai_estimated: aiRows,
    unavailable: unavailableRows,
    cheapest_claim: cheapestClaim,
    confirmed_price_note: confirmedPriceNote,
    hedged_claim: hedgedClaim,
    disclaimer_required: aiRows.length > 0,
    disclaimer_text: aiRows.length > 0 ? (PRICE_ESTIMATE_DISCLAIMER[language] || PRICE_ESTIMATE_DISCLAIMER.JA) : null
  };
}
