export { normalizeSearchQuery, validateSyncPayload, syncProducts } from './product-index.mjs';
import { normalizeSearchQuery } from './product-index.mjs';
import {
  analyzeSearchDecision,
  isNegatedSearchOccurrence,
  semanticSearchGroups,
  stripSearchBudget,
} from './search-intelligence.mjs';

const STOPWORDS = new Set([
  'with','from','that','this','the','for','and','type','size','like','edition','set',
  'sns','tiktok','instagram','twitter','youtube'
]);
const IDENTIFIER_STOPWORDS = new Set([
  ...STOPWORDS,
  'amazon','black','blue','brown','call','camera','cables','color','duty','gaming',
  'gold','green','inch','keyboard','orange','red','usb','white','yellow'
]);
const quote = (token) => `"${String(token).replaceAll('"','""')}"*`;
const cleanTenant = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);

function evidenceMatchEnd(text, match) {
  const end = match.index + match[0].length;
  if (!/^\d+(?:\.\d+)?$/u.test(match[0])) return end;
  const unit = text.slice(end).match(/^\s*(?:(?:w|mah|gb|tb|mb|mm|cm|ml|l|oz|m|inch|inches|kg|kgs|g|kilograms?|kilogrammes?|grams?)\b|毫米|厘米|センチ(?:メートル)?|ミリ(?:メートル)?|キロ(?:グラム)?|グラム|公斤|千克|센티미터|밀리미터|킬로그램|키로|그램)/iu);
  return end + (unit?.[0].length || 0);
}

export function intelligentFtsQuery(value) {
  const source = stripSearchBudget(value);
  const normalized = normalizeSearchQuery(source);
  const semantic = semanticSearchGroups(normalized)
    .map((group) => [...new Set(group.terms.map((term) => term.toLowerCase()))])
    .filter((group) => group.length)
    .slice(0, 4);
  const hasShoeIntent = semantic.some((group) => group.includes('shoe') || group.includes('sneaker'));
  const evidenceMatches = [
    ...normalized.matchAll(/\b\d{2,}\b/g),
    ...normalized.matchAll(/\b\d+[a-z-][a-z0-9-]*\b/g),
    ...normalized.matchAll(/\d+(?:\.\d+)?\s*(?:(?:kg|kgs|g|kilograms?|kilogrammes?|grams?)\b|キロ(?:グラム)?|グラム|公斤|千克|킬로그램|키로|그램)/giu),
    ...normalized.matchAll(/\d+\s*(?:個(?:入り)?セット|本セット|枚セット|件套|个装|個裝|개입|개\s*세트)/gu),
    ...(hasShoeIntent ? normalized.matchAll(/\d+(?:\.\d+)?\s*(?:mm|cm)\b/giu) : []),
    ...(hasShoeIntent ? normalized.matchAll(/\b(?:us|eu|uk)\s*(?:size\s*)?\d{1,2}(?:\.5)?\b/giu) : []),
    ...(hasShoeIntent ? normalized.matchAll(/\d{2}(?:\.5)?\s*(?:码|碼)/giu) : []),
  ];
  const evidenceTokens = evidenceMatches
    .filter((match) => !evidenceMatches.some((other) =>
      other !== match
      && other.index <= match.index
      && other.index + other[0].length >= match.index + match[0].length
      && other[0].length > match[0].length))
    .filter((match) => !isNegatedSearchOccurrence(
      normalized,
      match.index,
      evidenceMatchEnd(normalized, match),
    ))
    .map((match) => match[0]
      .replace(/\s+/gu, '')
      .replace(/キロ(?:グラム)?|公斤|千克|킬로그램|키로$/u, 'kg')
      .replace(/グラム|그램$/u, 'g')
      .replace(/kilogrammes?|kilograms?|kgs?$/iu, 'kg')
      .replace(/grams?$/iu, 'g')
      .replace(/^(\d+(?:\.\d+)?)(?:mm|cm|inch|inches|oz|[-]?(?:pack|count|pcs|pieces)|個(?:入り)?セット|本セット|枚セット|件套|个装|個裝|개입|개세트)$/iu, '$1')
      .replace(/^(us|eu|uk)size(\d)/iu, '$1 $2')
      .replace(/^(us|eu|uk)(\d)/iu, '$1 $2')
      .replace(/^(\d{2}(?:\.5)?)(?:码|碼)$/u, 'eu $1'));
  const groups = [...semantic];
  const modelTokens = source.match(/\b[A-Za-z][A-Za-z0-9-]*\d[A-Za-z0-9-]*\b/g) || [];
  const namedTokens = source.match(/\b[A-Z][A-Za-z]{3,}\b/g) || [];
  const localizedDeviceTokens = [
    /(?:\bxperia\b|エクスペリア|엑스페리아)/iu.test(source) ? 'xperia' : '',
    /(?:\baquos\b|アクオス|아쿠오스)/iu.test(source) ? 'aquos' : '',
  ].filter(Boolean);
  const identifiers = [...new Set([...modelTokens, ...namedTokens, ...localizedDeviceTokens]
    .map((token) => token.toLowerCase())
    .filter((token) => !IDENTIFIER_STOPWORDS.has(token)))]
    .slice(0, 6);
  if (modelTokens.length || localizedDeviceTokens.length || identifiers.length >= 2) groups.push(identifiers);
  // Free-form descriptions contain many context words that are absent from a
  // catalog title. Requiring one of them as another AND group suppresses valid
  // products. Keep direct tokens strict only when the query carries a concrete
  // model/size/quantity clue; semantic product groups handle ordinary prose.
  if (evidenceTokens.length) groups.push([...new Set(evidenceTokens)].slice(0, 6));
  if (!groups.length) return '';
  return groups.slice(0, 5).map((group) => {
    const expression = group.map(quote).join(' OR ');
    return groups.length === 1 ? expression : `(${expression})`;
  }).join(' AND ');
}

const RELAXED_CONTEXT_GROUPS = new Set([
  'color','kitchen-use','beauty-use','electronics-use','home-use',
  'vehicle-tool-use','hobby-use','light-up'
]);

export function relaxedFtsQuery(value) {
  const normalized = normalizeSearchQuery(value);
  const groups = semanticSearchGroups(normalized);
  const productTerms = groups
    .filter((group) => !RELAXED_CONTEXT_GROUPS.has(group.category))
    .flatMap((group) => group.terms);
  const fallbackTerms = groups.flatMap((group) => group.terms)
    .concat(normalized.match(/[a-z][a-z0-9-]{2,}/g) || []);
  const terms = (productTerms.length ? productTerms : fallbackTerms)
    .map((term) => String(term).toLowerCase())
    .filter((term) => term && !STOPWORDS.has(term) && !/^\d+$/.test(term));
  return [...new Set(terms)].slice(0, 16).map(quote).join(' OR ');
}

export async function attachSpApiOffers(env, tenant, rows = []) {
  const asins = [...new Set(rows.map((row) => String(row?.asin || '').trim().toUpperCase())
    .filter((asin) => /^[A-Z0-9]{10}$/.test(asin)))];
  if (!env.PRODUCT_DB || !asins.length) return rows;
  const placeholders = asins.map((_, index) => `?${index + 2}`).join(',');
  let result;
  try {
    result = await env.PRODUCT_DB.prepare(`SELECT tenant,merchant_id,seller_sku,asin,
      product_url,price,currency,quantity,created_at_amazon
      FROM sp_api_listings WHERE tenant=?1 AND asin IN (${placeholders})
      AND buyable=1 AND discoverable=1 AND missing_from_amazon=0`)
      .bind(cleanTenant(tenant), ...asins).all();
  } catch {
    return rows;
  }
  const byAsin = new Map();
  for (const item of result?.results || []) {
    const offers = byAsin.get(item.asin) || [];
    offers.push({
      marketplace: 'AMAZON_JP',
      seller_id: item.merchant_id,
      merchant_id: item.merchant_id,
      seller_sku: item.seller_sku,
      product_url: item.product_url,
      price: Number(item.price || 0),
      currency: item.currency || 'JPY',
      stock_status: Number(item.quantity || 0) > 0 ? 'IN_STOCK' : 'UNKNOWN',
      status: 'ACTIVE',
      registered_at: item.created_at_amazon || '',
      source: 'amazon_sp_api'
    });
    byAsin.set(item.asin, offers);
  }
  return rows.map((row) => ({ ...row, offers: byAsin.get(row.asin) || row.offers || [] }));
}

export async function attachMarketplaceOffers(env, tenant, rows = []) {
  if (!env.PRODUCT_DB || !rows.length) return rows;
  const asins = [...new Set(rows.map(row => String(row?.asin || '').trim().toUpperCase()).filter(Boolean))];
  const keys = [...new Set(rows.map(row => String(row?.record_key || '').trim()).filter(Boolean))];
  if (!asins.length && !keys.length) return rows;
  const values = [...asins, ...keys];
  const placeholders = values.map((_, index) => `?${index + 2}`).join(',');
  let result;
  try {
    result = await env.PRODUCT_DB.prepare(`SELECT * FROM marketplace_offers WHERE tenant=?1 AND active=1 AND stock_status NOT IN ('OUT_OF_STOCK','UNAVAILABLE') AND datetime(observed_at)>=datetime('now','-7 days') AND (asin IN (${placeholders}) OR record_key IN (${placeholders}))`)
      .bind(cleanTenant(tenant), ...values).all();
  } catch { return rows; }
  return rows.map(row => ({ ...row, offers: [...(row.offers || []), ...(result.results || []).filter(offer => (offer.asin && offer.asin === row.asin) || (offer.record_key && offer.record_key === row.record_key))] }));
}

export async function searchProductsV2(env, tenant, query, limit = 10) {
  if (!env.PRODUCT_DB) return null;
  const match = intelligentFtsQuery(query);
  if (!match) return [];
  let result = await env.PRODUCT_DB.prepare(`SELECT p.*,bm25(product_search,10.0,4.0,2.0) AS text_rank
    FROM product_search JOIN products p ON p.rowid=product_search.rowid
    WHERE product_search MATCH ?1 AND p.tenant=?2
    ORDER BY text_rank ASC,p.stock DESC LIMIT ?3`)
    .bind(match, cleanTenant(tenant), Math.min(Math.max(Number(limit) || 10, 1), 100)).all();
  if ((result.results || []).length < limit && String(query || '').includes(' / ')) {
    const relaxed = relaxedFtsQuery(query);
    if (relaxed) {
      const relaxedResult = await env.PRODUCT_DB.prepare(`SELECT p.*,bm25(product_search,10.0,4.0,2.0) AS text_rank
        FROM product_search JOIN products p ON p.rowid=product_search.rowid
        WHERE product_search MATCH ?1 AND p.tenant=?2
        ORDER BY text_rank ASC,p.stock DESC LIMIT ?3`)
        .bind(relaxed, cleanTenant(tenant), Math.min(Math.max(Number(limit) || 10, 1), 100)).all();
      const merged = new Map();
      for (const row of [...(result.results || []), ...(relaxedResult.results || [])]) {
        const key = String(row?.asin || row?.record_key || '').trim();
        if (key && !merged.has(key)) merged.set(key, row);
      }
      result = { ...result, results: [...merged.values()].slice(0, limit) };
    }
  }
  const amazonAttached = await attachSpApiOffers(env, cleanTenant(tenant), result.results || []);
  return attachMarketplaceOffers(env, cleanTenant(tenant), amazonAttached);
}

export async function searchProductsWithDecision(env, tenant, query, limit = 10) {
  const candidates = await searchProductsV2(env, tenant, query, Math.max(limit, 10));
  const visible = (candidates || []).slice(0, limit);
  return {
    candidates: visible,
    decision: analyzeSearchDecision(query, visible),
    search: { engine: 'D1_FTS_V2', fts_query: intelligentFtsQuery(query) }
  };
}

export async function searchProductsAcrossTenantsWithDecision(
  env,
  tenants,
  query,
  limit = 10
) {
  const allowed = [...new Set((Array.isArray(tenants) ? tenants : [tenants])
    .map(cleanTenant).filter(Boolean))].slice(0, 10);
  const perTenant = await Promise.all(allowed.map((tenant) =>
    searchProductsV2(env, tenant, query, Math.max(limit, 10))));
  const merged = new Map();
  for (const candidate of perTenant.flat()) {
    const key = String(candidate?.asin || candidate?.record_key || '');
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }
    merged.set(key, {
      ...(Number(candidate.text_rank) < Number(existing.text_rank) ? candidate : existing),
      offers: [...(existing.offers || []), ...(candidate.offers || [])]
    });
  }
  const candidates = [...merged.values()]
    .sort((left, right) =>
      Number(left.text_rank || 0) - Number(right.text_rank || 0) ||
      Number(right.stock || 0) - Number(left.stock || 0))
    .slice(0, limit);
  return {
    candidates,
    decision: analyzeSearchDecision(query, candidates),
    search: {
      engine: 'D1_FTS_V2_MULTI_TENANT',
      tenants: allowed,
      fts_query: intelligentFtsQuery(query)
    }
  };
}
