// 2026-10-02 大隆さん指示書「HOSHILUを『今ほしい人が買うためのサービス』へ再設計する」§9「商品詳細」
//
// 最重要画面。順序は 商品 → 現在価格 → 過去価格との比較 → 価格推移 → 購入先 → 購入 → 口コミ → 今買わない人へ。
// - 現在価格は、いま API に取りに行って確認できた値だけ（楽天 itemCode / Yahoo! JAN・商品コード）。取れなければ「未取得」。
// - 過去価格は price_observations（HOSHILU が自分で記録した分だけ）。記録開始日を必ず出す。将来の価格は予言しない。
// - 購入先リンクは既存の /go（署名トークン）を通す。計測・アフィリエイト・許可リストは既存と同じ。
// - 検索本文・会員IDは扱わない。
// - 2026-10-25 大隆さん「購入サイト送客を無料で100倍にする方法は？」→「初めて良い」: 記録が SEO_MIN_DAYS 日以上ある商品だけ、
//   HOSHILU が記録した価格（今いくら・30日の最安/最高・推移）を本文に入れて検索エンジンに公開する（index）。記録が足りない商品は noindex のまま。
//   本文はサーバーで組み立て（D1 だけ読む。外部 API は呼ばない）、開いたあと product-detail.mjs が最新の価格に差し替える。
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

const PAGE_HEAD_START = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`;
const PAGE_HEAD_END = `<meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/product-detail.css?v=3"><link rel="icon" href="/icons/icon.svg">`;
const PAGE_SCRIPTS = `<script type="module" src="/growth-analytics.mjs?v=21"></script><script type="module" src="/product-detail.mjs?v=5"></script>`;
const PAGE_FOOTER = `<footer><span>© HOSHILU</span><span class="associate-disclosure">楽天アフィリエイト、およびバリューコマース（Yahoo!ショッピング等）のリンクから収入を得る場合があります。価格・送料・在庫は取得時点の確認値で、購入前に販売先でご確認ください。</span></footer>`;
const PAGE_HEADER = `<header class="topbar"><a class="brand" href="/"><img src="/icons/icon.svg" width="40" height="40" alt=""><span>HOSHILU</span></a></header>`;
export const SEO_MIN_DAYS = 14;
export const SITEMAP_PRODUCTS_PATH = '/sitemap-products.xml';
const SITEMAP_PRODUCTS_LIMIT = 20000;

const yen = (value) => `¥${Number(value).toLocaleString('ja-JP')}`;
const slashDate = (value) => String(value || '').replace(/-/gu, '/');
export const productCanonical = (key, origin = 'https://hoshilu.app') => `${origin}/product?key=${encodeURIComponent(key)}`;

// 検索エンジンに出す材料（D1 の記録だけ。外部 API は呼ばない）。記録が SEO_MIN_DAYS 日未満・商品名が無いときは null（noindex のまま）。
export async function productSeoSnapshot(env, key, { now = new Date() } = {}) {
  const db = env?.PRODUCT_DB;
  if (!db || !key) return null;
  let latest = null;
  let days = 0;
  try {
    latest = await db.prepare(`SELECT product_name, product_url, marketplace, price, total, shipping, stock_status, observed_date
      FROM price_observations WHERE record_key=?1 AND product_name<>'' ORDER BY observed_date DESC, COALESCE(total, price) ASC LIMIT 1`).bind(key).first();
    const counted = await db.prepare('SELECT COUNT(DISTINCT observed_date) AS days FROM price_observations WHERE record_key=?1').bind(key).first();
    days = Number(counted?.days || 0);
  } catch {
    return null;
  }
  if (!latest || !String(latest.product_name || '').trim() || days < SEO_MIN_DAYS) return null;
  const history = await priceHistorySummary(env, key, { now });
  if (!history?.measurable) return null;
  return {
    key,
    name: String(latest.product_name).trim().slice(0, 200),
    product_url: /^https:\/\//iu.test(String(latest.product_url || '')) ? String(latest.product_url) : '',
    marketplace: String(latest.marketplace || ''),
    marketplace_label: MALL_LABEL[latest.marketplace] || String(latest.marketplace || ''),
    latest_price: Number(latest.total ?? latest.price),
    shipping_included: latest.total !== null && latest.total !== undefined,
    stock_status: String(latest.stock_status || 'UNKNOWN'),
    latest_date: String(latest.observed_date),
    days,
    history
  };
}

// サーバー側の推移グラフ（public/product-detail.mjs の chart と同じ寸法・見た目。文字は価格の最高・最安だけ）
export function priceChartSvg(series) {
  const points = (series || []).filter((p) => Number(p.price) > 0);
  if (points.length < 2) return '';
  const W = 320; const H = 120; const padX = 8; const padY = 14;
  const dates = points.map((p) => Date.parse(p.date));
  const prices = points.map((p) => Number(p.price));
  const minD = Math.min(...dates); const maxD = Math.max(...dates) || minD + 1;
  const minP = Math.min(...prices); const maxP = Math.max(...prices);
  const x = (d) => padX + (maxD === minD ? 0 : (d - minD) / (maxD - minD)) * (W - padX * 2);
  const y = (p) => H - padY - (maxP === minP ? 0.5 : (p - minP) / (maxP - minP)) * (H - padY * 2);
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const gap = i > 0 && (dates[i] - dates[i - 1]) > 36 * 60 * 60 * 1000;
    d += `${i === 0 || gap ? 'M' : 'L'}${x(dates[i]).toFixed(1)},${y(prices[i]).toFixed(1)} `;
  }
  const dots = points.map((_, i) => `<circle class="product-chart-dot" cx="${x(dates[i]).toFixed(1)}" cy="${y(prices[i]).toFixed(1)}" r="2.2"></circle>`).join('');
  return `<svg class="product-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="価格推移 ${esc(points[0].date)} から ${esc(points[points.length - 1].date)}。最安 ${esc(yen(minP))}、最高 ${esc(yen(maxP))}。"><path class="product-chart-line" d="${d.trim()}"></path>${dots}<text class="product-chart-label" x="${padX}" y="10" text-anchor="start">${esc(yen(maxP))}</text><text class="product-chart-label" x="${W - padX}" y="${H - 2}" text-anchor="end">${esc(yen(minP))}</text></svg>`;
}

function seoTitle(snapshot) {
  const name = snapshot.name.length > 60 ? `${snapshot.name.slice(0, 59)}…` : snapshot.name;
  return `${name}｜今いくら？価格推移と最安値（${snapshot.marketplace_label}）| HOSHILU`;
}

function seoDescription(snapshot) {
  const h = snapshot.history;
  const d30 = h.d30 ? `30日間の最安 ${yen(h.d30.min)}・最高 ${yen(h.d30.max)}（記録 ${h.d30.days_observed}日）。` : '';
  return `${snapshot.marketplace_label}の価格を HOSHILU が ${slashDate(h.recording_since)} から毎日記録。${slashDate(snapshot.latest_date)} の価格 ${yen(snapshot.latest_price)}。${d30}買う前に、今の値段が安いか高いかを過去の記録で確かめられます。`.slice(0, 160);
}

function comparisonLines(history, current) {
  const lines = [];
  if (history.seven_days_ago) lines.push(`7日前 ${yen(history.seven_days_ago.price)}`);
  if (history.d30) lines.push(`30日 最安 ${yen(history.d30.min)} ／ 最高 ${yen(history.d30.max)}（記録 ${history.d30.days_observed}日）`);
  if (history.d90 && history.d90.days_observed > (history.d30?.days_observed || 0)) lines.push(`90日 最安 ${yen(history.d90.min)} ／ 中央値 ${yen(history.d90.median)} ／ 最高 ${yen(history.d90.max)}`);
  const d90Longer = history.d90 && history.d90.days_observed > (history.d30?.days_observed || 0);
  const base = d90Longer && history.d90.days_observed >= 14 ? history.d90 : history.d30?.days_observed >= 7 ? history.d30 : null;
  if (current && base) {
    const diff = Math.round((current - base.median) / base.median * 100);
    const label = base === history.d90 ? '90' : '30';
    if (diff <= -3) lines.push(`${slashDate(history.latest.date)} の価格は${label}日中央値より約${Math.abs(diff)}％安い`);
    else if (diff >= 3) lines.push(`${slashDate(history.latest.date)} の価格は${label}日中央値より約${diff}％高い`);
    else lines.push(`${slashDate(history.latest.date)} の価格は${label}日中央値とほぼ同じ`);
    if (current <= base.min) lines.push('HOSHILU価格記録開始後の最安値');
  }
  return lines;
}

function jsonLd(snapshot, canonical) {
  const availability = { IN_STOCK: 'https://schema.org/InStock', OUT_OF_STOCK: 'https://schema.org/OutOfStock' }[snapshot.stock_status];
  const offer = { '@type': 'Offer', price: String(snapshot.latest_price), priceCurrency: 'JPY', url: snapshot.product_url || canonical, seller: { '@type': 'Organization', name: snapshot.marketplace_label } };
  if (availability) offer.availability = availability;
  const data = {
    '@context': 'https://schema.org', '@type': 'Product', name: snapshot.name, url: canonical,
    description: `HOSHILU が ${slashDate(snapshot.history.recording_since)} から記録している ${snapshot.marketplace_label} の価格推移。`,
    offers: offer
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</gu, '\\u003c')}</script>`;
}

// 本文（サーバー側）。public/product-detail.mjs と同じ順序・同じクラス名。開いたあとに最新の価格へ差し替わる。
export function renderProductSeoBody(snapshot, buyUrl = '') {
  const h = snapshot.history;
  const lines = comparisonLines(h, snapshot.latest_price).map((line) => `<li>${esc(line)}</li>`).join('');
  const buy = buyUrl ? `<p class="product-buy-row"><a class="product-buy" href="${esc(buyUrl)}" rel="noopener noreferrer sponsored">${esc(snapshot.marketplace_label)}で買う</a></p>` : '';
  return `<section class="product-head"><div class="product-head-text"><h1 class="product-name">${esc(snapshot.name)}</h1><p class="product-mall">${esc(snapshot.marketplace_label)} で確認した商品</p></div></section>
<section class="product-now"><h2>今いくら？</h2><p class="product-now-price">${esc(yen(snapshot.latest_price))}</p><p class="product-now-note">${snapshot.shipping_included ? '送料込み' : '送料未確認・商品価格のみ'} ／ ${esc(snapshot.marketplace_label)} ／ ${esc(slashDate(snapshot.latest_date))} の記録（開くと最新の価格を確認します）</p>${buy}</section>
<section class="product-history"><h2>過去の価格と比べる</h2><ul class="product-history-list">${lines}</ul><p class="product-history-since">HOSHILUでの価格記録開始：${esc(slashDate(h.recording_since))}（記録は1日1回。無い日は空白のままにしています）</p>${priceChartSvg(h.series)}</section>
<section class="product-offers"><h2>買う場所を選ぶ</h2>${buy || '<p>販売先のリンクは、開いたあとに最新の価格と一緒に表示します。</p>'}</section>`;
}

export function renderProductPage(key, snapshot = null, { origin = 'https://hoshilu.app', buyUrl = '' } = {}) {
  const canonical = productCanonical(key, origin);
  const indexable = Boolean(snapshot);
  const head = indexable
    ? `<meta name="robots" content="index,follow"><link rel="canonical" href="${esc(canonical)}"><meta name="description" content="${esc(seoDescription(snapshot))}"><meta property="og:title" content="${esc(seoTitle(snapshot))}"><meta property="og:description" content="${esc(seoDescription(snapshot))}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="product">${jsonLd(snapshot, canonical)}`
    : '<meta name="robots" content="noindex">';
  const title = indexable ? seoTitle(snapshot) : '今いくら？｜ホシル';
  const main = indexable
    ? `<main class="product-detail" id="productDetail" data-key="${esc(key)}">${renderProductSeoBody(snapshot, buyUrl)}<p class="product-detail-loading" id="productStatus" role="status" hidden></p></main>`
    : `<main class="product-detail" id="productDetail" data-key="${esc(key)}">
  <p class="product-detail-loading" id="productStatus" role="status">価格を確認しています…</p>
</main>`;
  const body = `${PAGE_HEADER}\n${main}\n${PAGE_FOOTER}\n${PAGE_SCRIPTS}`;
  const headers = indexable
    ? { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600, s-maxage=3600' }
    : { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  return new Response(`${PAGE_HEAD_START}${head}${PAGE_HEAD_END}<title>${esc(title)}</title></head><body>${body}</body></html>`, { headers });
}

// 検索エンジン向けの商品一覧（記録 SEO_MIN_DAYS 日以上・商品名あり）。D1 だけ読む。1 時間キャッシュ。
export async function renderProductsSitemap(env, { origin = 'https://hoshilu.app' } = {}) {
  const db = env?.PRODUCT_DB;
  let rows = [];
  try {
    rows = db ? (await db.prepare(`SELECT record_key, MAX(observed_date) AS lastmod FROM price_observations
      WHERE product_name<>'' GROUP BY record_key HAVING COUNT(DISTINCT observed_date)>=?1 ORDER BY lastmod DESC LIMIT ?2`).bind(SEO_MIN_DAYS, SITEMAP_PRODUCTS_LIMIT).all()).results || [] : [];
  } catch {
    rows = [];
  }
  const urls = rows.filter((row) => normalizeProductKey(row.record_key))
    .map((row) => `<url><loc>${esc(productCanonical(row.record_key, origin))}</loc><lastmod>${esc(row.lastmod)}</lastmod><changefreq>daily</changefreq></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=21600', 'x-product-count': String(rows.length) }
  });
}

// index.mjs から呼ぶ。sign は createTrackToken を包んだ関数（セッション・署名鍵は index 側が持つ）。
export async function handleProductDetailRoutes(request, env, ctx, deps = {}) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return null;
  if (url.pathname === SITEMAP_PRODUCTS_PATH) return renderProductsSitemap(env, { origin: url.origin });
  if (url.pathname === '/product') {
    const key = normalizeProductKey(url.searchParams.get('key'));
    if (!key) return new Response('商品が見つかりません', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const snapshot = await productSeoSnapshot(env, key);
    let buyUrl = '';
    if (snapshot?.product_url && deps.sign) {
      try { buyUrl = await deps.sign({ d: snapshot.product_url, m: snapshot.marketplace, j: `${key}:${snapshot.marketplace}:seo` }); } catch { buyUrl = ''; }
    }
    return renderProductPage(key, snapshot, { origin: url.origin, buyUrl });
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
