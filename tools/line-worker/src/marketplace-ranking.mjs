import { expandSearchQuery } from './query-expansion.mjs';
import { isRakutenAffiliateProductUrl, isRakutenDirectProductUrl } from './rakuten-url-policy.mjs';

const RAKUTEN_RANKING_API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';

// 公式ランキングページで子ジャンルとIDを照合したものだけを登録する。
// 未登録語を広い親ジャンルへ勝手に丸めず、確認質問へ戻すのがランキング検索の安全弁。
export const RAKUTEN_RANKING_CATEGORIES = Object.freeze([
  { id: 'handheld_fan', label: 'ハンディファン', genre_id: '565082', patterns: [/ハンディファン|携帯扇風機|顔用扇風機/iu] },
  { id: 'wireless_earphones', label: 'ワイヤレスイヤホン', genre_id: '502835', patterns: [/ワイヤレスイヤホン|bluetooth\s*イヤホン|イヤホン|earbuds?/iu] },
  { id: 'womens_sneakers', label: 'レディーススニーカー', genre_id: '206906', patterns: [/レディース.{0,4}スニーカー|女性.{0,4}スニーカー|women'?s?\s*sneakers?/iu] },
  { id: 'mobile_battery', label: 'モバイルバッテリー', genre_id: '564277', patterns: [/モバイルバッテリー|携帯充電器|power\s*bank/iu] },
  { id: 'face_lotion', label: '化粧水・ローション', genre_id: '216307', patterns: [/化粧水|フェイスローション|face\s*lotion|toner/iu] }
]);

export const MARKETPLACE_RANKING_CAPABILITIES = Object.freeze([
  { marketplace_id: 'RAKUTEN_JP', label: '楽天市場', ranking_mode: 'native_api', review_mode: 'summary_api', status: 'available' },
  { marketplace_id: 'YAHOO_JP', label: 'Yahoo!ショッピング', ranking_mode: 'derived_api', review_mode: 'summary_api', status: 'planned' },
  { marketplace_id: 'AMAZON_JP', label: 'Amazon', ranking_mode: 'native_api', review_mode: 'direct_link', status: 'awaiting_sp_api' },
  ...[
    ['QOO10_JP','Qoo10'],['SHEIN_JP','SHEIN'],['ZOZOTOWN_JP','ZOZOTOWN'],['LOFT_JP','ロフト'],
    ['HANDS_JP','ハンズ'],['MATSUKIYO_JP','マツキヨココカラ'],['COSME_JP','@cosme'],
    ['BUYMA_JP','BUYMA'],['SNKRDUNK_JP','SNKRDUNK'],['ABCMART_JP','ABC-MART']
  ].map(([marketplace_id,label])=>({ marketplace_id, label, ranking_mode: 'direct_link', review_mode: 'direct_link', status: 'available' }))
]);

export function resolveRankingCategory(rawQuery) {
  const expanded = expandSearchQuery(rawQuery);
  const query = String(expanded.query || '').normalize('NFKC').trim();
  const category = RAKUTEN_RANKING_CATEGORIES.find((entry) =>
    query === entry.id || query === entry.label || entry.patterns.some((pattern) => pattern.test(query))) || null;
  const priorityPatterns = [
    [/扇風機|ファン/iu, 'handheld_fan'], [/イヤホン|ヘッドホン|音楽/iu, 'wireless_earphones'],
    [/靴|スニーカー|シューズ/iu, 'womens_sneakers'], [/充電|バッテリー/iu, 'mobile_battery'],
    [/化粧水|ローション|スキンケア/iu, 'face_lotion']
  ];
  const preferredIds = priorityPatterns.filter(([pattern]) => pattern.test(query)).map(([, id]) => id);
  const options = [...RAKUTEN_RANKING_CATEGORIES]
    .sort((a, b) => preferredIds.indexOf(b.id) - preferredIds.indexOf(a.id))
    .map(({ id, label }) => ({ value: id, label }));
  return category
    ? { resolved: true, query, category: { id: category.id, label: category.label, genre_id: category.genre_id } }
    : { resolved: false, query, clarification: {
      question: 'どの小分類のランキングを見ますか？',
      guidance: '近い小分類を選ぶか、商品種類を入力してHOSHILUへ伝えてください。広い分類のまま順位は作りません。',
      options
    } };
}

function parseAiCategoryIds(payload, allowedIds) {
  let text = '';
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) text += part?.text || '';
  }
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const block of Array.isArray(item?.content) ? item.content : []) if (block?.type === 'output_text') text += block.text || '';
  }
  const object = String(text).match(/\{[\s\S]*\}/u)?.[0];
  if (!object) return [];
  try {
    const parsed = JSON.parse(object);
    return [...new Set((Array.isArray(parsed.category_ids) ? parsed.category_ids : [])
      .map((value) => String(value || '')).filter((value) => allowedIds.has(value)))].slice(0, 3);
  } catch { return []; }
}

export async function suggestRankingCategoriesWithAi(env, rawQuery, options, fetcher = fetch) {
  const allowedIds = new Set(options.map((option) => option.value));
  const prompt = `HOSHILUのランキング検索で、広い検索語から近い小分類候補を並べます。\n検索語: ${String(rawQuery || '').slice(0, 200)}\n選択可能: ${options.map((option) => `${option.value}=${option.label}`).join(', ')}\n適切な候補だけを最大3件、JSON {"category_ids":[""]} で返してください。選択肢にない分類は作らず、該当なしなら空配列にしてください。`;
  const providers = [
    String(env.GEMINI_API_KEY || '').length >= 20 && 'gemini',
    String(env.OPENAI_API_KEY || '').length >= 20 && 'openai'
  ].filter(Boolean);
  for (const provider of providers) {
    try {
      const response = provider === 'gemini'
        ? await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash'))}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(4000)
        })
        : await fetcher('https://api.openai.com/v1/responses', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5'), input: prompt, reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } } }),
          signal: AbortSignal.timeout(4000)
        });
      if (!response.ok) continue;
      const ids = parseAiCategoryIds(await response.json(), allowedIds);
      if (ids.length) return ids;
    } catch {}
  }
  return [];
}

function itemOf(value) { return value?.Item || value?.item || value || {}; }

export function normalizeRakutenRanking(payload = {}) {
  return (payload.Items || payload.items || []).slice(0, 30).map((value, index) => {
    const item = itemOf(value);
    const affiliateUrl = String(item.affiliateUrl || '').trim();
    const regularUrl = String(item.itemUrl || '').trim();
    const productUrl = isRakutenAffiliateProductUrl(affiliateUrl) ? affiliateUrl : (isRakutenDirectProductUrl(regularUrl) ? regularUrl : '');
    const images = [...(item.mediumImageUrls || []), ...(item.smallImageUrls || [])]
      .map((image) => String(image?.imageUrl || image || '').trim()).filter((url) => /^https:\/\//i.test(url));
    return {
      rank: Math.max(1, Number(item.rank) || index + 1),
      product_name: String(item.itemName || '').trim().slice(0, 300),
      display_name: String(item.itemName || '').trim().slice(0, 300),
      image_url: images[0] || '', image_urls: [...new Set(images)].slice(0, 8),
      review_average: Number(item.reviewAverage) || 0,
      review_count: Math.max(0, Number(item.reviewCount) || 0),
      marketplace_source: 'RAKUTEN_ICHIBA_RANKING_API',
      offers: productUrl ? [{ marketplace: 'RAKUTEN_JP', product_url: productUrl, tracking_url: productUrl, price: Number(item.itemPrice) || 0, total_cost: Number(item.itemPrice) || 0, shipping_fee: null, shipping_fee_confirmed: false, currency: 'JPY', stock_status: 'UNKNOWN', source: 'rakuten_ranking_api' }] : []
    };
  }).filter((item) => item.product_name && item.offers.length);
}

export async function fetchRakutenRanking(env, category, fetcher = fetch) {
  if (!String(env.RAKUTEN_APPLICATION_ID || '').trim() || !String(env.RAKUTEN_ACCESS_KEY || '').trim()) throw new Error('RAKUTEN_RANKING_NOT_CONFIGURED');
  const url = new URL(RAKUTEN_RANKING_API);
  url.searchParams.set('applicationId', String(env.RAKUTEN_APPLICATION_ID).trim());
  url.searchParams.set('accessKey', String(env.RAKUTEN_ACCESS_KEY).trim());
  url.searchParams.set('genreId', String(category.genre_id));
  url.searchParams.set('formatVersion', '2');
  const affiliateId = String(env.RAKUTEN_AFFILIATE_ID || '').trim();
  if (affiliateId) url.searchParams.set('affiliateId', affiliateId);
  const response = await fetcher(url.toString(), { headers: { accept: 'application/json', referer: 'https://hoshilu.app/', origin: 'https://hoshilu.app' }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) { const error = new Error('RAKUTEN_RANKING_FAILED'); error.status = response.status; throw error; }
  return normalizeRakutenRanking(await response.json());
}

async function readRankingCache(env, marketplaceId, categoryId, rankingType, now = Date.now()) {
  if (!env.PRODUCT_DB) return null;
  try {
    const row = await env.PRODUCT_DB.prepare('SELECT payload_json, expires_at FROM marketplace_ranking_cache WHERE marketplace_id=?1 AND category_id=?2 AND ranking_type=?3').bind(marketplaceId, categoryId, rankingType).first();
    if (!row || Date.parse(row.expires_at) <= now) return null;
    const value = JSON.parse(row.payload_json); return Array.isArray(value) ? value : null;
  } catch { return null; }
}

async function writeRankingCache(env, marketplaceId, categoryId, rankingType, candidates, now = Date.now()) {
  if (!env.PRODUCT_DB) return;
  try {
    const updatedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
    await env.PRODUCT_DB.prepare('INSERT INTO marketplace_ranking_cache(marketplace_id,category_id,ranking_type,payload_json,expires_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(marketplace_id,category_id,ranking_type) DO UPDATE SET payload_json=excluded.payload_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at').bind(marketplaceId, categoryId, rankingType, JSON.stringify(candidates), expiresAt, updatedAt).run();
  } catch {}
}

export async function marketplaceRankingResult(env, rawQuery, marketplaceId, fetcher = fetch) {
  const resolution = resolveRankingCategory(rawQuery);
  if (!resolution.resolved) {
    const recommendedIds = await suggestRankingCategoriesWithAi(env, rawQuery, resolution.clarification.options, fetcher);
    const order = new Map(recommendedIds.map((id, index) => [id, index]));
    const options = resolution.clarification.options.map((option) => ({
      ...option, ai_recommended: order.has(option.value)
    })).sort((a, b) => (order.get(a.value) ?? 99) - (order.get(b.value) ?? 99));
    return { mode: 'clarification', ...resolution, clarification: { ...resolution.clarification, options } };
  }
  const capability = MARKETPLACE_RANKING_CAPABILITIES.find((entry) => entry.marketplace_id === marketplaceId);
  if (!capability) throw new Error('RANKING_MARKETPLACE_INVALID');
  if (marketplaceId === 'RAKUTEN_JP') {
    const rankingType = 'REALTIME';
    let candidates = await readRankingCache(env, marketplaceId, resolution.category.id, rankingType);
    const cacheHit = Boolean(candidates);
    if (!candidates) {
      candidates = await fetchRakutenRanking(env, resolution.category, fetcher);
      await writeRankingCache(env, marketplaceId, resolution.category.id, rankingType, candidates);
    }
    return { mode: 'native_api', marketplace: capability, category: resolution.category, ranking_type: '楽天市場 リアルタイムランキング', cache_hit: cacheHit, candidates };
  }
  return { mode: capability.ranking_mode, marketplace: capability, category: resolution.category, ranking_type: capability.status === 'planned' ? '準備中' : 'モールでランキングを調べる', candidates: [] };
}
