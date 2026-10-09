// 2026-10-02 大隆さん指示書「HOSHILUを『今ほしい人が買うためのサービス』へ再設計する」§9「商品詳細」
//
// 最重要画面。順序は 商品 → 現在価格 → 過去価格との比較 → 価格推移 → 購入先 → 購入 → 口コミ → 今買わない人へ。
// - 現在価格は、いま API に取りに行って確認できた値だけ（楽天 itemCode / Yahoo! JAN・商品コード）。取れなければ「未取得」。
// - 過去価格は price_observations（HOSHILU が自分で記録した分だけ）。記録開始日を必ず出す。将来の価格は予言しない。
// - 購入先リンクは既存の /go（署名トークン）を通す。計測・アフィリエイト・許可リストは既存と同じ。
// - 検索本文・会員IDは扱わない。ページは当面 noindex。
import { rakutenApiConfigured, searchRakutenMarketplace } from './rakuten-marketplace-api.mjs';
import { yahooShoppingApiConfigured, searchYahooShopping } from './yahoo-shopping-api.mjs';
import { recordPriceObservations, priceHistorySummary } from './price-observations.mjs';

const MALL_LABEL = { RAKUTEN_JP: '楽天市場', YAHOO_JP: 'Yahoo!ショッピング' };
const KEY_PATTERN = /^(?:RAKUTEN:[A-Za-z0-9][A-Za-z0-9_.:-]{0,145}|YAHOO:[A-Za-z0-9][A-Za-z0-9_.:-]{0,120}|JAN:\d{8}(?:\d{5})?)$/u;

export function normalizeProductKey(value) {
  const key = String(value || '').trim();
  if (!KEY_PATTERN.test(key) || /^(?:RAKUTEN|YAHOO):https?:/iu.test(key)) return '';
  return key;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

// いまの価格を API に確認しに行く。候補の中から record_key が一致するものだけを採用する（タイトル一致では混ぜない）。
export async function fetchCurrentProduct(env, key, fetcher = fetch) {
  let candidates = [];
  let provider = '';
  try {
    if (key.startsWith('RAKUTEN:')) {
      provider = 'RAKUTEN_JP';
      if (rakutenApiConfigured(env)) candidates = await searchRakutenMarketplace(env, '', fetcher, '', { itemCode: key.slice(8) });
    } else {
      provider = 'YAHOO_JP';
      // JAN は Yahoo! の検索語としてそのまま使える。商品コードは店舗内コードで検索できないため JAN 無しの Yahoo! 商品は未取得になり得る。
      const query = key.startsWith('JAN:') ? key.slice(4) : '';
      if (query && yahooShoppingApiConfigured(env)) candidates = await searchYahooShopping(env, query, fetcher);
    }
  } catch {
    return { provider, status: 'API_FAILURE', candidates: [] };
  }
  const matched = candidates.filter((candidate) => String(candidate?.record_key || '') === key);
  return { provider, status: matched.length ? 'OK' : 'NOT_FOUND', candidates: matched };
}

function presentOffer(candidate, offer, trackingUrl) {
  const shippingConfirmed = offer.shipping_fee_confirmed === true;
  const shipping = shippingConfirmed ? Number(offer.shipping_fee) || 0 : null;
  const price = Number(offer.price) || 0;
  return {
    marketplace: offer.marketplace,
    marketplace_label: MALL_LABEL[offer.marketplace] || offer.marketplace,
    seller_id: String(offer.seller_id || ''),
    price,
    shipping_fee: shipping,
    shipping_fee_confirmed: shippingConfirmed,
    total: shipping === null ? null : price + shipping,
    stock_status: String(offer.stock_status || 'UNKNOWN'),
    delivery_days: Number.isInteger(offer.delivery_days) ? offer.delivery_days : null,
    tracking_url: trackingUrl,
    review_average: Number(candidate.review_average) || 0,
    review_count: Number(candidate.review_count) || 0,
    review_url: /^https:\/\//iu.test(String(candidate.review_url || '')) ? String(candidate.review_url) : ''
  };
}

export async function buildProductDetail(env, key, { fetcher = fetch, now = new Date(), sign = null, origin = 'https://hoshilu.app', record = recordPriceObservations } = {}) {
  const current = await fetchCurrentProduct(env, key, fetcher);
  const candidate = current.candidates[0] || null;
  if (candidate) await record(env, current.candidates, { source: 'product_detail', now }).catch(() => {});
  const offers = [];
  for (const [index, offer] of (candidate?.offers || []).entries()) {
    if (!Number(offer?.price) || !/^https:\/\//iu.test(String(offer?.product_url || ''))) continue;
    const trackingUrl = sign ? await sign({ d: offer.product_url, m: offer.marketplace, j: `${key}:${offer.marketplace || index}` }) : '';
    offers.push(presentOffer(candidate, offer, trackingUrl));
  }
  const history = await priceHistorySummary(env, key, { now });
  return {
    ok: true,
    key,
    product: candidate ? {
      name: String(candidate.display_name || candidate.product_name || ''),
      image_url: /^https:\/\//iu.test(String(candidate.image_url || '')) ? String(candidate.image_url) : '',
      marketplace: current.provider,
      marketplace_label: MALL_LABEL[current.provider] || current.provider
    } : null,
    current: { status: current.status, fetched_at: now.toISOString(), offers },
    history: history || { record_key: key, measurable: false, reason: 'HISTORY_UNAVAILABLE' }
  };
}

const PAGE_HEAD = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/product-detail.css?v=2"><link rel="icon" href="/icons/icon.svg">`;

export function renderProductPage(key) {
  const body = `<header class="topbar"><a class="brand" href="/"><img src="/icons/icon.svg" width="40" height="40" alt=""><span>HOSHILU</span></a></header>
<main class="product-detail" id="productDetail" data-key="${esc(key)}">
  <p class="product-detail-loading" id="productStatus" role="status">価格を確認しています…</p>
</main>
<footer><span>© HOSHILU</span><span class="associate-disclosure">楽天アフィリエイト、およびバリューコマース（Yahoo!ショッピング等）のリンクから収入を得る場合があります。価格・送料・在庫は取得時点の確認値で、購入前に販売先でご確認ください。</span></footer>
<script type="module" src="/growth-analytics.mjs?v=16"></script><script type="module" src="/product-detail.mjs?v=3"></script>`;
  return new Response(`${PAGE_HEAD}<title>今いくら？｜ホシル</title></head><body>${body}</body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
  });
}

// index.mjs から呼ぶ。sign は createTrackToken を包んだ関数（セッション・署名鍵は index 側が持つ）。
export async function handleProductDetailRoutes(request, env, ctx, deps = {}) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return null;
  if (url.pathname === '/product') {
    const key = normalizeProductKey(url.searchParams.get('key'));
    if (!key) return new Response('商品が見つかりません', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return renderProductPage(key);
  }
  if (url.pathname === '/api/product') {
    const key = normalizeProductKey(url.searchParams.get('key'));
    if (!key) return json({ ok: false, error: 'PRODUCT_KEY_INVALID' }, 400);
    try {
      const detail = await buildProductDetail(env, key, { fetcher: deps.fetcher || fetch, sign: deps.sign || null, origin: url.origin });
      return json(detail);
    } catch {
      return json({ ok: false, error: 'PRODUCT_UNAVAILABLE' }, 503);
    }
  }
  return null;
}
