// 2026-09-20 GPT 指示書 §P0（大隆さん承認）「URL 貼り付け→ホシっとく」
//
// Google / Instagram / TikTok / ブラウザで見つけた商品ページの URL を検索窓に貼ると、
// そのページを 1 回だけ取りに行き、JSON-LD Product/Offer → OG タグ の順で
// 商品名・画像・価格を読み取って「この商品ですか？」カードにする。
//
// 絶対に守ること（§7）:
// - 価格は JSON-LD の Offer（JPY）か商品ページの meta（product:price:amount, JPY）だけ。
//   読めなければ price_available=false で「この商品の価格は現在自動追跡できません」と出す。推測しない。
// - 対象は HOSHILU が扱う 13 モールの商品ページ URL だけ（marketplaceForProductUrl で判定）。
//   それ以外の URL は取りに行かない（SSRF・無関係サイトの取得を避ける）。
// - 取得は 6 秒・1MB まで。失敗しても検索は止めない。
import { marketplaceForProductUrl } from './marketplace-product-url-policy.mjs';

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 1_000_000;
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const USER_AGENT = 'Mozilla/5.0 (compatible; HOSHILU-ProductPreview/1.0; +https://hoshilu.app)';

export const MARKETPLACE_LABELS = Object.freeze({
  AMAZON_JP: 'Amazon', RAKUTEN_JP: '楽天市場', YAHOO_JP: 'Yahoo!ショッピング', QOO10_JP: 'Qoo10', SHEIN_JP: 'SHEIN',
  ZOZOTOWN_JP: 'ZOZOTOWN', SHOPLIST_JP: 'SHOPLIST', MUSINSA_JP: 'MUSINSA', BUYMA_JP: 'BUYMA', SNKRDUNK_JP: 'SNKRDUNK'
});

// 検索窓の文字列が「1 本の商品 URL」かどうか（前後の空白は許す。文＋URL は対象外）。
export function productUrlFromQuery(query) {
  const text = String(query || '').trim();
  if (!/^https?:\/\/\S+$/iu.test(text)) return null;
  const canonical = text.replace(/^http:\/\//iu, 'https://');
  const marketplace = marketplaceForProductUrl(canonical);
  if (!marketplace) return null;
  return { url: canonical, marketplace };
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ').trim();
}

function metaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'iu'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'iu')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return '';
}

function jsonLdProducts(html) {
  const products = [];
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu);
  for (const block of blocks) {
    let parsed;
    try { parsed = JSON.parse(block[1].trim()); } catch { continue; }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      const type = [].concat(node['@type'] || []).map(String);
      if (type.includes('Product')) products.push(node);
      if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
      if (Array.isArray(node.itemListElement)) queue.push(...node.itemListElement.map((entry) => entry?.item || entry));
    }
  }
  return products;
}

function jpyPrice(amount, currency) {
  const value = Number(String(amount ?? '').replace(/[^\d.]/g, ''));
  const code = String(currency || '').toUpperCase();
  if (!Number.isFinite(value) || value < 1) return 0;
  if (code && code !== 'JPY') return 0;
  return Math.round(value);
}

// HTML から商品情報を読む（純関数。テストしやすいよう fetch と分離）。
export function parseProductPage(html, { url, marketplace }) {
  const text = String(html || '');
  let name = '', image = '', price = 0, brand = '';
  for (const product of jsonLdProducts(text)) {
    name = name || decodeEntities(product.name || '');
    const images = [].concat(product.image || []);
    const first = images.find((entry) => typeof entry === 'string') || images.find((entry) => entry?.url)?.url || '';
    image = image || String(first || '');
    brand = brand || decodeEntities(typeof product.brand === 'string' ? product.brand : product.brand?.name || '');
    const offers = [].concat(product.offers || []);
    for (const offer of offers) {
      const candidate = jpyPrice(offer?.price ?? offer?.lowPrice, offer?.priceCurrency);
      if (candidate && (!price || candidate < price)) price = candidate;
    }
    if (name && image && price) break;
  }
  name = name || metaContent(text, 'og:title') || metaContent(text, 'twitter:title') || decodeEntities((text.match(/<title[^>]*>([^<]*)<\/title>/iu) || [])[1] || '');
  image = image || metaContent(text, 'og:image') || metaContent(text, 'twitter:image');
  if (!price) {
    const amount = metaContent(text, 'product:price:amount') || metaContent(text, 'og:price:amount');
    const currency = metaContent(text, 'product:price:currency') || metaContent(text, 'og:price:currency') || 'JPY';
    price = jpyPrice(amount, currency);
  }
  if (!/^https:\/\//iu.test(image)) image = '';
  return {
    url, marketplace, marketplace_label: MARKETPLACE_LABELS[marketplace] || marketplace,
    name: name.slice(0, 200), brand: brand.slice(0, 80), image_url: image.slice(0, 500),
    price_jpy: price, price_available: price > 0,
    price_note: price > 0 ? 'ページに書かれていた価格（取得時点）' : 'この商品の価格は現在自動追跡できません'
  };
}

// 戻り値: { ok, product?, reason? }。失敗は理由だけ返す（推測しない）。
export async function identifyProductUrl(env, query, options = {}) {
  const target = productUrlFromQuery(query);
  if (!target) return { ok: false, reason: 'NOT_PRODUCT_URL' };
  const fetchImpl = options.fetch || fetch;
  const cache = options.cache === null ? null : (options.cache || (globalThis.caches?.default ?? null));
  const cacheRequest = new Request(`https://product-url-identify.hoshilu.internal/v1?u=${encodeURIComponent(target.url)}`);
  if (cache) {
    try { const hit = await cache.match(cacheRequest); if (hit) return await hit.json(); } catch {}
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(target.url, {
      signal: controller.signal, redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', 'accept-language': 'ja,en;q=0.5' }
    });
    if (!response.ok) return { ok: false, reason: `HTTP_${response.status}` };
    const html = (await response.text()).slice(0, MAX_BYTES);
    const product = parseProductPage(html, target);
    if (!product.name) return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
    const result = { ok: true, product };
    if (cache) {
      try {
        await cache.put(cacheRequest, new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` } }));
      } catch {}
    }
    return result;
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'TIMEOUT' : 'FETCH_FAILED' };
  } finally {
    clearTimeout(timer);
  }
}
