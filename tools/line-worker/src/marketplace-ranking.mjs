import { expandSearchQuery } from './query-expansion.mjs';
import { isRakutenAffiliateProductUrl, isRakutenDirectProductUrl } from './rakuten-url-policy.mjs';
import { fetchYahooHighRatingRanking, searchYahooShopping } from './yahoo-shopping-api.mjs';

const RAKUTEN_RANKING_API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';
// 2026-07-01版の公式API。商品検索が返す実商品のgenreIdを入口にし、
// Genre Searchで公式の小分類名・親子階層を確認する。固定辞書だけに依存せず、
// 楽天市場の全ジャンルをオンデマンドでランキング候補にできるようにする。
const RAKUTEN_ITEM_SEARCH_API = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const RAKUTEN_GENRE_SEARCH_API = 'https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701';

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
  { marketplace_id: 'YAHOO_JP', label: 'Yahoo!ショッピング', ranking_mode: 'native_api', review_mode: 'aggregate_api', status: 'available' },
  { marketplace_id: 'AMAZON_JP', label: 'Amazon', ranking_mode: 'direct_link', review_mode: 'direct_link', status: 'available' },
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
    .map(({ id, label, genre_id }) => ({ value: id, label, genre_id, source: 'STATIC_REGISTRY' }));
  return category
    ? { resolved: true, query, category: { id: category.id, label: category.label, genre_id: category.genre_id } }
    : { resolved: false, query, clarification: {
      question: 'どの小分類のランキングを見ますか？',
      guidance: '近い小分類を選ぶか、商品種類を入力してHOSHILUへ伝えてください。広い分類のまま順位は作りません。',
      options
    } };
}

function rakutenApiUrl(endpoint, env) {
  if (!String(env.RAKUTEN_APPLICATION_ID || '').trim() || !String(env.RAKUTEN_ACCESS_KEY || '').trim()) throw new Error('RAKUTEN_RANKING_NOT_CONFIGURED');
  const url = new URL(endpoint);
  url.searchParams.set('applicationId', String(env.RAKUTEN_APPLICATION_ID).trim());
  url.searchParams.set('accessKey', String(env.RAKUTEN_ACCESS_KEY).trim());
  url.searchParams.set('formatVersion', '2');
  const affiliateId = String(env.RAKUTEN_AFFILIATE_ID || '').trim();
  if (affiliateId) url.searchParams.set('affiliateId', affiliateId);
  return url;
}

function rakutenRequestOptions(timeout = 5000) {
  return {
    headers: { accept: 'application/json', referer: 'https://hoshilu.app/', origin: 'https://hoshilu.app' },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeout)
  };
}

function arrayOfItems(payload = {}) {
  return payload.Items || payload.items || [];
}

function genreNode(value = {}) { return value?.genre || value?.Genre || value || {}; }

export function normalizeRakutenGenre(payload = {}) {
  const current = genreNode(payload.genre || payload.current?.genre || payload.currentGenre || payload.current || {});
  const genreId = String(current.genreId || current.genre_id || '').trim();
  const label = String(current.nameJa || current.genreName || current.name || '').trim();
  if (!/^\d{3,12}$/u.test(genreId) || !label) return null;
  const ancestors = (payload.ancestors || payload.Ancestors || []).map(genreNode)
    .map((node) => String(node.nameJa || node.genreName || node.name || '').trim()).filter(Boolean);
  const path = [...ancestors.filter((name) => name !== label), label];
  return { genre_id: genreId, label, level: Math.max(0, Number(current.level) || 0), path };
}

export async function fetchRakutenGenre(env, genreId, fetcher = fetch) {
  const value = String(genreId || '').trim();
  if (!/^\d{3,12}$/u.test(value)) throw new Error('RAKUTEN_GENRE_INVALID');
  const url = rakutenApiUrl(RAKUTEN_GENRE_SEARCH_API, env);
  url.searchParams.set('genreId', value);
  const response = await fetcher(url.toString(), rakutenRequestOptions());
  if (!response.ok) { const error = new Error('RAKUTEN_GENRE_FAILED'); error.status = response.status; throw error; }
  const genre = normalizeRakutenGenre(await response.json());
  if (!genre || genre.genre_id !== value) throw new Error('RAKUTEN_GENRE_INVALID');
  return genre;
}

async function discoveryCacheKey(rawQuery) {
  const bytes = new TextEncoder().encode(String(rawQuery || '').normalize('NFKC').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `discovery_${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('').slice(0, 32)}`;
}

function truncateUtf8(value, maxBytes = 120) {
  let result = '';
  for (const character of String(value || '')) {
    if (new TextEncoder().encode(result + character).byteLength > maxBytes) break;
    result += character;
  }
  return result;
}

// 入力語に対する楽天の実商品上位30件からgenreIdを集計し、上位3分類を
// Genre Search APIで公式名称へ解決する。商品タイトルからAIが分類名を創作する
// 方式ではないため、固定5分類以外も同じ根拠で安全に増やせる。
export async function discoverRakutenRankingCategories(env, rawQuery, fetcher = fetch) {
  const query = truncateUtf8(String(expandSearchQuery(rawQuery).query || rawQuery || '').normalize('NFKC').replace(/\s+/gu, ' ').trim());
  if (query.length < 2 && !/^[\p{Script=Han}\p{Script=Katakana}]$/u.test(query)) return [];
  const cacheKey = await discoveryCacheKey(query);
  const cached = await readRankingCache(env, 'RAKUTEN_JP', cacheKey, 'GENRE_DISCOVERY');
  if (cached) return cached;
  const url = rakutenApiUrl(RAKUTEN_ITEM_SEARCH_API, env);
  url.searchParams.set('keyword', query);
  url.searchParams.set('hits', '30');
  url.searchParams.set('field', '0');
  url.searchParams.set('elements', 'genreId,itemName');
  const response = await fetcher(url.toString(), rakutenRequestOptions(4500));
  if (!response.ok) return [];
  const scores = new Map();
  arrayOfItems(await response.json()).slice(0, 30).forEach((value, index) => {
    const item = itemOf(value); const genreId = String(item.genreId || '').trim();
    if (/^\d{3,12}$/u.test(genreId)) scores.set(genreId, (scores.get(genreId) || 0) + Math.max(1, 30 - index));
  });
  const ids = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([genreId]) => genreId);
  const details = await Promise.allSettled(ids.map((genreId) => fetchRakutenGenre(env, genreId, fetcher)));
  const categories = details.filter((result) => result.status === 'fulfilled').map((result) => {
    const genre = result.value;
    return {
      value: `rakuten_${genre.genre_id}`,
      label: genre.path.slice(-2).join(' › '),
      query: genre.label,
      genre_id: genre.genre_id,
      source: 'RAKUTEN_GENRE_API',
      official_category: true
    };
  });
  await writeRankingCache(env, 'RAKUTEN_JP', cacheKey, 'GENRE_DISCOVERY', categories, Date.now(), 24 * 60 * 60 * 1000);
  return categories;
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

async function aiProviderFetch(fetcher, url, options) {
  return fetcher(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(4000) });
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
        ? await aiProviderFetch(fetcher, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash'))}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } })
        })
        : await aiProviderFetch(fetcher, 'https://api.openai.com/v1/responses', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5'), input: prompt, reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } } })
        });
      if (!response.ok) continue;
      const ids = parseAiCategoryIds(await response.json(), allowedIds);
      if (ids.length) return ids;
    } catch {}
  }
  return [];
}

function rankingCategoryOption(category = {}) {
  return {
    value: String(category.id || ''),
    label: String(category.label || ''),
    query: String(category.label || ''),
    genre_id: String(category.genre_id || ''),
    source: 'STATIC_REGISTRY',
    official_category: true
  };
}

function uniqueRankingCategoryOptions(options = []) {
  const seen = new Set();
  return options.filter((option) => {
    const key = String(option.genre_id || option.value || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ランキング取得前の確認専用。ここでは商品ランキングAPIを呼ばず、
// 入力から推定した小分類候補だけを最大3件返す。YES後に初めてランキングを
// 取得するため、誤分類のまま高コストな検索へ進まず、NOで次候補へ移れる。
export async function rankingCategoryConfirmationResult(env, rawQuery, fetcher = fetch) {
  const resolution = resolveRankingCategory(rawQuery);
  const discovered = await discoverRakutenRankingCategories(env, rawQuery, fetcher).catch(() => []);
  const direct = resolution.resolved ? [rankingCategoryOption(resolution.category)] : [];
  const staticOptions = resolution.resolved
    ? RAKUTEN_RANKING_CATEGORIES.map(rankingCategoryOption)
    : resolution.clarification.options;
  const rawPool = uniqueRankingCategoryOptions([...direct, ...discovered, ...staticOptions]);
  const recommendedIds = await suggestRankingCategoriesWithAi(env, rawQuery, rawPool, fetcher);
  const order = new Map(recommendedIds.map((id, index) => [id, index]));
  const directId = direct[0]?.value;
  // AIまたは公式商品検索が関連ありと判断していない固定ジャンルを、
  // NO後の穴埋めとして無関係に表示しない。
  const groundedIds = new Set([...direct, ...discovered].map((option) => option.value));
  const pool = rawPool.filter((option) => groundedIds.has(option.value) || order.has(option.value));
  const options = pool
    .map((option, index) => ({ option, index }))
    .sort((a, b) => {
      if (a.option.value === directId) return -1;
      if (b.option.value === directId) return 1;
      const aiA = order.get(a.option.value); const aiB = order.get(b.option.value);
      if (aiA !== undefined || aiB !== undefined) return (aiA ?? 99) - (aiB ?? 99);
      const discoveredA = a.option.source === 'RAKUTEN_GENRE_API' ? 0 : 1;
      const discoveredB = b.option.source === 'RAKUTEN_GENRE_API' ? 0 : 1;
      return discoveredA - discoveredB || a.index - b.index;
    })
    .map(({ option }) => option)
    .slice(0, 3);
  return {
    mode: 'category_confirmation',
    query: String(rawQuery || '').trim(),
    confirmation: {
      question: 'このジャンルですか？',
      guidance: 'YESを押すと、人気ランキングと最安値ランキングを選べます。違う場合はNOを押してください。',
      options,
      max_rejections: 3
    }
  };
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

export function normalizeRakutenReviewRanking(payload = {}) {
  return normalizeRakutenRanking({ Items: arrayOfItems(payload).map((value, index) => ({
    ...itemOf(value), rank: index + 1
  })) }).map((candidate) => ({ ...candidate, marketplace_source: 'RAKUTEN_ICHIBA_ITEM_SEARCH_REVIEW_COUNT' }));
}

export async function fetchRakutenReviewRanking(env, category, fetcher = fetch) {
  const url = rakutenApiUrl(RAKUTEN_ITEM_SEARCH_API, env);
  url.searchParams.set('genreId', String(category.genre_id));
  url.searchParams.set('sort', '-reviewCount');
  url.searchParams.set('hits', '30');
  const response = await fetcher(url.toString(), rakutenRequestOptions());
  if (!response.ok) { const error = new Error('RAKUTEN_REVIEW_RANKING_FAILED'); error.status = response.status; throw error; }
  return normalizeRakutenReviewRanking(await response.json());
}

export async function fetchRakutenRanking(env, category, fetcher = fetch) {
  const url = rakutenApiUrl(RAKUTEN_RANKING_API, env);
  url.searchParams.set('genreId', String(category.genre_id));
  const response = await fetcher(url.toString(), rakutenRequestOptions());
  if (!response.ok) { const error = new Error('RAKUTEN_RANKING_FAILED'); error.status = response.status; throw error; }
  return normalizeRakutenRanking(await response.json());
}

export async function readRankingCache(env, marketplaceId, categoryId, rankingType, now = Date.now()) {
  if (!env.PRODUCT_DB) return null;
  try {
    const row = await env.PRODUCT_DB.prepare('SELECT payload_json, expires_at FROM marketplace_ranking_cache WHERE marketplace_id=?1 AND category_id=?2 AND ranking_type=?3').bind(marketplaceId, categoryId, rankingType).first();
    if (!row || Date.parse(row.expires_at) <= now) return null;
    const value = JSON.parse(row.payload_json); return Array.isArray(value) ? value : null;
  } catch { return null; }
}

export async function writeRankingCache(env, marketplaceId, categoryId, rankingType, candidates, now = Date.now(), ttlMs = 5 * 60 * 1000) {
  if (!env.PRODUCT_DB) return;
  try {
    const updatedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlMs).toISOString();
    await env.PRODUCT_DB.prepare('INSERT INTO marketplace_ranking_cache(marketplace_id,category_id,ranking_type,payload_json,expires_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(marketplace_id,category_id,ranking_type) DO UPDATE SET payload_json=excluded.payload_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at').bind(marketplaceId, categoryId, rankingType, JSON.stringify(candidates), expiresAt, updatedAt).run();
  } catch {}
}

async function resolveSelectedRankingCategory(env, selection, fetcher) {
  if (!selection) return null;
  const staticCategory = RAKUTEN_RANKING_CATEGORIES.find((entry) => entry.id === selection.id || entry.genre_id === String(selection.genre_id));
  if (staticCategory) return { id: staticCategory.id, label: staticCategory.label, genre_id: staticCategory.genre_id, source: 'STATIC_REGISTRY' };
  const genre = await fetchRakutenGenre(env, selection.genre_id, fetcher);
  return { id: `rakuten_${genre.genre_id}`, label: genre.path.slice(-2).join(' › '), genre_id: genre.genre_id, source: 'RAKUTEN_GENRE_API' };
}

export async function marketplaceRankingResult(env, rawQuery, marketplaceId, fetcher = fetch, categorySelection = null) {
  const selectedCategory = await resolveSelectedRankingCategory(env, categorySelection, fetcher);
  const resolution = selectedCategory
    ? { resolved: true, query: String(rawQuery || '').trim(), category: selectedCategory }
    : resolveRankingCategory(rawQuery);
  if (!resolution.resolved) {
    const [recommendedIds, discovered] = await Promise.all([
      suggestRankingCategoriesWithAi(env, rawQuery, resolution.clarification.options, fetcher),
      discoverRakutenRankingCategories(env, rawQuery, fetcher).catch(() => [])
    ]);
    const order = new Map(recommendedIds.map((id, index) => [id, index]));
    const staticOptions = resolution.clarification.options.map((option) => ({
      ...option, ai_recommended: order.has(option.value)
    })).sort((a, b) => (order.get(a.value) ?? 99) - (order.get(b.value) ?? 99));
    const discoveredIds = new Set(discovered.map((option) => option.genre_id));
    const options = [...discovered, ...staticOptions.filter((option) => !discoveredIds.has(option.genre_id))].slice(0, 12);
    const guidance = discovered.length
      ? '楽天市場の実商品から見つけた公式小分類です。近い分類を選んでください。選択後は全13モールの観測商品を同じ分類で集計します。'
      : resolution.clarification.guidance;
    return { mode: 'clarification', ...resolution, clarification: { ...resolution.clarification, guidance, options, dynamic_category_count: discovered.length } };
  }
  const capability = MARKETPLACE_RANKING_CAPABILITIES.find((entry) => entry.marketplace_id === marketplaceId);
  if (!capability) throw new Error('RANKING_MARKETPLACE_INVALID');
  if (marketplaceId === 'RAKUTEN_JP') {
    let rankingType = 'REALTIME';
    let mode = 'native_api';
    let rankingLabel = '楽天市場 リアルタイムランキング';
    let candidates = await readRankingCache(env, marketplaceId, resolution.category.id, rankingType);
    const cacheHit = Boolean(candidates);
    if (!candidates) {
      try {
        candidates = await fetchRakutenRanking(env, resolution.category, fetcher);
      } catch (error) {
        if (error.status !== 404) throw error;
        rankingType = 'REVIEW_COUNT'; mode = 'derived_api'; rankingLabel = '楽天市場 口コミ件数順';
        candidates = await readRankingCache(env, marketplaceId, resolution.category.id, rankingType);
        if (!candidates) candidates = await fetchRakutenReviewRanking(env, resolution.category, fetcher);
      }
      await writeRankingCache(env, marketplaceId, resolution.category.id, rankingType, candidates);
    }
    return { mode, marketplace: capability, category: resolution.category, ranking_type: rankingLabel, cache_hit: cacheHit, candidates };
  }
  if (marketplaceId === 'YAHOO_JP') {
    const rankingType = 'HIGH_RATING_TREND';
    const categoryQuery = String(resolution.category.label || rawQuery).split('›').pop().trim();
    let candidates = await readRankingCache(env, marketplaceId, resolution.category.id, rankingType);
    const cacheHit = Boolean(candidates);
    let mode = 'native_api';
    let rankingLabel = 'Yahoo!ショッピング 高評価トレンドランキング';
    if (!candidates) {
      try {
        candidates = await fetchYahooHighRatingRanking(env, categoryQuery, fetcher);
      } catch (error) {
        // 外部APIの一時障害でランキング検索を行き止まりにしない。既存の商品
        // 検索APIによる口コミ件数順へ縮退し、公式ランキングとは明確に区別する。
        console.warn('YAHOO_HIGH_RATING_RANKING_FALLBACK', {
          status: Number(error?.status) || 0,
          code: String(error?.message || 'YAHOO_HIGH_RATING_RANKING_FAILED').slice(0, 80)
        });
        candidates = await readRankingCache(env, marketplaceId, resolution.category.id, 'REVIEW_COUNT');
        if (!candidates) {
          try {
            candidates = await searchYahooShopping(env, categoryQuery, fetcher, { sort: '-review_count' });
          } catch (fallbackError) {
            // 公式ランキングAPIと商品検索APIが同時に利用不能でも502で終わらせず、
            // 呼び出し元が検証済みのYahoo!検索リンクを返せるdirect_linkへ縮退する。
            // 認証・課金設定には触れず、監視canaryは別経路で失敗を継続検知する。
            console.warn('YAHOO_RANKING_DIRECT_LINK_FALLBACK', {
              status: Number(fallbackError?.status) || 0,
              code: String(fallbackError?.message || 'YAHOO_SHOPPING_SEARCH_FAILED').slice(0, 80)
            });
            return {
              mode: 'direct_link', marketplace: capability, category: resolution.category,
              ranking_type: 'Yahoo!ショッピングで検索', cache_hit: false,
              provider_unavailable: true, candidates: []
            };
          }
        }
        mode = 'derived_api';
        rankingLabel = 'Yahoo!ショッピング 口コミ件数順';
      }
      await writeRankingCache(env, marketplaceId, resolution.category.id, mode === 'native_api' ? rankingType : 'REVIEW_COUNT', candidates);
    }
    return { mode, marketplace: capability, category: resolution.category, ranking_type: rankingLabel, cache_hit: cacheHit, candidates };
  }
  return { mode: capability.ranking_mode, marketplace: capability, category: resolution.category, ranking_type: capability.status === 'planned' ? '準備中' : 'モールでランキングを調べる', candidates: [] };
}
