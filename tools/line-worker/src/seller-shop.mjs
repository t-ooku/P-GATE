// 2026-09-04 総合実行指示書 §24–29 ¥9,800 Seller: 公開ショップページ・クーポン・フォロー。
//
// - 公開URL /shop/<slug>: ロゴ・紹介文・商品一覧（products / sp_api_listings から）・クーポン・
//   「ショップをホシる」（会員フォロー）。
// - 検索結果の商品カードに「この商品を扱うショップ」と、HOSHILU限定クーポンがあれば 🎟。
// - ショップ設定・クーポンは Business プラン（seller_billing_accounts.plan='BUSINESS' かつ ACTIVE）だけ。
// - 商品を二重管理しない: 商品は既存テーブルから tenant / seller_id で引く。
// - 商品リンクは /go の署名トークン経由（マーケットプレイスクリックとして既存計測に載る）。
// - growth_events: shop_viewed / shop_followed / shop_unfollowed / coupon_clicked（Worker 側で記録）。

import { readMemberSession } from './member-auth.mjs';
import { searchProductsV2 } from './product-index-v2.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 制御文字（U+0000–U+001F, U+007F）。パッチ運搬でユニコードエスケープが崩れないよう fromCharCode で組む。
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g');
const CONTROL_CHARS_KEEP_NEWLINE = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g');
const clean = (value, max) => String(value ?? '').normalize('NFKC').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const MARKETPLACES = new Set(['', 'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP']);
const MARKETPLACE_LABEL = { AMAZON_JP: 'Amazon', RAKUTEN_JP: '楽天市場', YAHOO_JP: 'Yahoo!ショッピング', QOO10_JP: 'Qoo10', SHEIN_JP: 'SHEIN' };

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function safeList(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.map((v) => clean(v, 160)).filter(Boolean) : []; } catch { return []; }
}
function httpsUrl(value, max = 500) {
  const text = clean(value, max);
  if (!text) return '';
  try { const url = new URL(text); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : ''; } catch { return ''; }
}

export function slugify(value) {
  return clean(value, 60).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 40);
}

export function validateShopInput(input = {}) {
  const shopName = clean(input.shop_name, 60);
  if (shopName.length < 1) throw new Error('SHOP_NAME_REQUIRED');
  const slug = slugify(input.slug || shopName);
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(slug)) throw new Error('SHOP_SLUG_INVALID');
  if (['admin', 'seller', 'shop', 'api', 'login', 'member', 'hoshilu', 'search', 'go', 'health'].includes(slug)) throw new Error('SHOP_SLUG_RESERVED');
  return {
    slug,
    shop_name: shopName,
    tagline: clean(input.tagline, 80),
    intro: String(input.intro ?? '').normalize('NFKC').replace(CONTROL_CHARS_KEEP_NEWLINE, '').replace(/\r\n?/g, '\n').trim().slice(0, 1500),
    logo_url: httpsUrl(input.logo_url),
    cover_url: httpsUrl(input.cover_url),
    website_url: httpsUrl(input.website_url),
    status: input.status === 'HIDDEN' ? 'HIDDEN' : 'ACTIVE'
  };
}

export function validateCouponInput(input = {}) {
  const title = clean(input.title, 60);
  if (title.length < 1) throw new Error('COUPON_TITLE_REQUIRED');
  const marketplace = clean(input.marketplace, 20).toUpperCase();
  if (!MARKETPLACES.has(marketplace)) throw new Error('COUPON_MARKETPLACE_INVALID');
  const day = (value) => { const text = clean(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''; };
  return {
    title,
    code: clean(input.code, 40),
    discount_text: clean(input.discount_text, 40),
    marketplace,
    landing_url: httpsUrl(input.landing_url),
    terms: clean(input.terms, 300),
    hoshilu_only: input.hoshilu_only === false || input.hoshilu_only === 0 ? 0 : 1,
    starts_at: day(input.starts_at),
    ends_at: day(input.ends_at)
  };
}

function couponIsLive(coupon, today = jstToday()) {
  if (coupon.status !== 'ACTIVE') return false;
  if (coupon.starts_at && coupon.starts_at > today) return false;
  if (coupon.ends_at && coupon.ends_at < today) return false;
  return true;
}
function jstToday() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }

async function recordShopEvent(env, eventType, slug, extra = {}) {
  if (!env?.PRODUCT_DB) return;
  try {
    await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
      VALUES(?1,?2,'JA','worker','shop',?3,?4,?5,?6,'UNATTRIBUTED')`)
      .bind(crypto.randomUUID(), eventType, clean(slug, 40), clean(extra.content, 80), clean(extra.marketplace, 20), new Date().toISOString()).run();
  } catch {}
}

// ---- 検索結果へのショップ付与 -------------------------------------------------
let shopCache = { at: 0, shops: [] };
export function resetShopCache() { shopCache = { at: 0, shops: [] }; }

export async function activeShops(env, { now = Date.now() } = {}) {
  if (!env?.PRODUCT_DB) return [];
  if (now - shopCache.at < 60000) return shopCache.shops;
  try {
    const rows = await env.PRODUCT_DB.prepare(`SELECT s.seller_key,s.slug,s.shop_name,s.logo_url,s.tenants,s.seller_ids,
      (SELECT COUNT(*) FROM seller_shop_coupons c WHERE c.seller_key=s.seller_key AND c.status='ACTIVE' AND c.hoshilu_only=1
        AND (c.starts_at='' OR c.starts_at<=?1) AND (c.ends_at='' OR c.ends_at>=?1)) AS live_coupons
      FROM seller_shops s JOIN seller_billing_accounts a ON a.seller_key=s.seller_key
      WHERE s.status='ACTIVE' AND a.plan='BUSINESS' AND a.status='ACTIVE' LIMIT 500`).bind(jstToday()).all();
    const shops = (rows.results || []).map((row) => ({
      seller_key: row.seller_key, slug: row.slug, name: row.shop_name, logo_url: row.logo_url || '',
      tenants: safeList(row.tenants).map((t) => t.toLowerCase()), seller_ids: safeList(row.seller_ids),
      coupon: Number(row.live_coupons || 0) > 0
    }));
    shopCache = { at: now, shops };
    return shops;
  } catch {
    return shopCache.shops;
  }
}

export function shopForOffer(shops = [], { tenant = '', sellerId = '' } = {}) {
  const t = clean(tenant, 32).toLowerCase();
  const s = clean(sellerId, 160);
  return shops.find((shop) => (t && shop.tenants.includes(t)) || (s && shop.seller_ids.includes(s))) || null;
}

// 公開JSON へ載せる最小の形。seller_key は出さない。
export function publicShopRef(shop) {
  return shop ? { slug: shop.slug, name: shop.name, coupon: shop.coupon === true } : null;
}

// ---- ショップページ用データ ---------------------------------------------------
async function loadShop(db, slug) {
  const row = await db.prepare(`SELECT s.*,a.plan,a.status AS account_status FROM seller_shops s
    LEFT JOIN seller_billing_accounts a ON a.seller_key=s.seller_key WHERE s.slug=?1`).bind(clean(slug, 40).toLowerCase()).first();
  if (!row || row.status !== 'ACTIVE' || row.plan !== 'BUSINESS' || row.account_status !== 'ACTIVE') return null;
  return { ...row, tenants: safeList(row.tenants), seller_ids: safeList(row.seller_ids) };
}

async function liveCoupons(db, sellerKey) {
  const rows = await db.prepare(`SELECT * FROM seller_shop_coupons WHERE seller_key=?1 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 20`).bind(sellerKey).all();
  const today = jstToday();
  return (rows.results || []).filter((c) => couponIsLive(c, today));
}

async function shopProducts(env, shop, query = '') {
  const db = env.PRODUCT_DB;
  const items = [];
  const seen = new Set();
  const push = (item) => {
    const url = httpsUrl(item.url);
    if (!url || !item.name || seen.has(url)) return;
    seen.add(url);
    items.push({ name: clean(item.name, 160), image: httpsUrl(item.image), url, price: Number(item.price) > 0 ? Number(item.price) : 0, marketplace: item.marketplace || 'AMAZON_JP', asin: clean(item.asin, 20), tenant: item.tenant || '' });
  };
  const q = clean(query, 80);
  for (const tenant of shop.tenants.slice(0, 5)) {
    if (q) {
      try {
        for (const row of await searchProductsV2(env, tenant, q, 24)) {
          push({ name: row.product_name, image: row.image_url, url: row.amazon_jp_url, asin: row.asin, tenant });
        }
      } catch {}
      continue;
    }
    try {
      const listings = await db.prepare(`SELECT product_name,image_url,product_url,price,asin FROM sp_api_listings
        WHERE tenant=?1 AND buyable=1 AND image_url<>'' ORDER BY updated_at DESC LIMIT 48`).bind(tenant).all();
      for (const row of listings.results || []) push({ name: row.product_name, image: row.image_url, url: row.product_url, price: row.price, asin: row.asin, tenant });
    } catch {}
    if (items.length >= 24) continue;
    try {
      const rows = await db.prepare(`SELECT product_name,image_url,amazon_jp_url,asin FROM products
        WHERE tenant=?1 AND image_url<>'' AND stock>0 AND amazon_jp_url<>'' LIMIT 48`).bind(tenant).all();
      for (const row of rows.results || []) push({ name: row.product_name, image: row.image_url, url: row.amazon_jp_url, asin: row.asin, tenant });
    } catch {}
  }
  return items.slice(0, 48);
}

async function followerCount(db, sellerKey) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM member_shop_follows WHERE seller_key=?1`).bind(sellerKey).first();
  return Number(row?.c || 0);
}

// ---- 公開ページ ----------------------------------------------------------------
function renderShopHtml({ shop, coupons, products, followers, following, query, origin }) {
  const title = `${shop.shop_name} | HOSHILU ショップ`;
  const description = clean(shop.tagline || shop.intro || `${shop.shop_name} の商品とクーポンを HOSHILU でまとめて見る。`, 150);
  const initial = esc(clean(shop.shop_name, 1).toUpperCase());
  const logo = shop.logo_url ? `<img class="shop-logo" src="${esc(shop.logo_url)}" alt="" width="72" height="72">` : `<span class="shop-logo shop-logo-text">${initial}</span>`;
  const couponHtml = coupons.length ? `<section class="shop-section" id="coupons"><h2>🎟 クーポン${coupons.some((c) => c.hoshilu_only) ? '（HOSHILU限定）' : ''}</h2><div class="coupon-grid">${coupons.map((c) => `
    <article class="coupon"><strong>${esc(c.title)}</strong>${c.discount_text ? `<span class="coupon-discount">${esc(c.discount_text)}</span>` : ''}
    ${c.code ? `<code class="coupon-code" data-code="${esc(c.code)}">${esc(c.code)}</code>` : ''}
    <small>${c.marketplace ? esc(MARKETPLACE_LABEL[c.marketplace] || c.marketplace) : '対象モール共通'}${c.ends_at ? ` ・ ${esc(c.ends_at)} まで` : ''}${c.hoshilu_only ? ' ・ HOSHILU限定' : ''}</small>
    ${c.terms ? `<small class="coupon-terms">${esc(c.terms)}</small>` : ''}
    ${c.landing_url ? `<a class="coupon-link" rel="nofollow sponsored" href="/shop/${esc(shop.slug)}/coupon/${esc(c.coupon_id)}">クーポンを使う →</a>` : ''}</article>`).join('')}</div></section>` : '';
  const productHtml = products.length ? products.map((p) => `
    <a class="shop-product" rel="nofollow sponsored" href="${esc(p.tracking_url)}" target="_blank">
      ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="shop-product-noimage"></span>'}
      <span class="shop-product-name">${esc(p.name)}</span>
      <span class="shop-product-meta">${p.price ? `¥${Number(p.price).toLocaleString('ja-JP')} ・ ` : ''}${esc(MARKETPLACE_LABEL[p.marketplace] || p.marketplace)} で見る</span></a>`).join('')
    : `<p class="shop-empty">${query ? '該当する商品が見つかりませんでした。' : 'まだ商品が登録されていません。'}</p>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(origin)}/shop/${esc(shop.slug)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">${shop.logo_url ? `<meta property="og:image" content="${esc(shop.logo_url)}">` : ''}
<meta name="theme-color" content="#7357ff"><link rel="icon" href="/icons/icon.svg">
<style>
:root{--ink:#17172b;--muted:#6d6b80;--line:#e9e5f5;--accent:#7357ff}*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--ink);background:#f8f7fc}
.top{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#fff;border-bottom:1px solid var(--line)}
.top a{color:var(--accent);text-decoration:none;font-weight:800;font-size:13px}
.wrap{width:min(960px,100%);margin:0 auto;padding:14px}
.hero{display:flex;gap:14px;align-items:center;padding:16px;background:#fff;border:1px solid var(--line);border-radius:18px}
.shop-logo{width:72px;height:72px;border-radius:18px;object-fit:cover;flex:none;background:#ece8fb}
.shop-logo-text{display:grid;place-items:center;font-size:30px;font-weight:900;color:var(--accent)}
.hero h1{margin:0;font-size:20px}.hero p{margin:4px 0 0;color:var(--muted);font-size:13px}
.hero-body{min-width:0;flex:1}
.follow{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
.follow button{padding:9px 14px;border:1px solid var(--accent);border-radius:999px;background:var(--accent);color:#fff;font-weight:800;font-size:13px;cursor:pointer}
.follow button[data-following="1"]{background:#fff;color:var(--accent)}
.follow small{color:var(--muted)}
.intro{margin:12px 0 0;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:14px;font-size:14px;line-height:1.7;white-space:pre-wrap}
.shop-section{margin-top:16px}.shop-section h2{font-size:15px;margin:0 0 8px}
.coupon-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.coupon{display:grid;gap:4px;padding:12px 14px;border:1px dashed #b9a9ff;border-radius:14px;background:linear-gradient(135deg,#fff,#f4f0ff);font-size:13px}
.coupon-discount{color:#d1156b;font-weight:900;font-size:18px}
.coupon-code{display:inline-block;padding:4px 8px;background:#fff;border:1px solid var(--line);border-radius:8px;font-size:14px;letter-spacing:.08em;cursor:pointer}
.coupon small{color:var(--muted);font-size:11px}.coupon-link{color:var(--accent);font-weight:800;text-decoration:none}
.search{display:flex;gap:6px;margin:0 0 10px}.search input{flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:12px;font-size:14px}
.search button{padding:10px 14px;border:0;border-radius:12px;background:var(--accent);color:#fff;font-weight:800}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.shop-product{display:grid;gap:6px;padding:10px;background:#fff;border:1px solid var(--line);border-radius:14px;text-decoration:none;color:var(--ink)}
.shop-product img,.shop-product-noimage{width:100%;aspect-ratio:1;object-fit:contain;border-radius:10px;background:#f3f1fa}
.shop-product-name{font-size:12px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.shop-product-meta{font-size:11px;color:var(--accent);font-weight:800}
.shop-empty{color:var(--muted);font-size:13px}
.foot{margin:24px 0 40px;color:var(--muted);font-size:11px;line-height:1.6}
.foot a{color:var(--accent)}
</style></head><body>
<header class="top"><a href="/">← HOSHILU で横断検索</a><a href="/for-sellers">ショップページを持つ</a></header>
<main class="wrap" data-slug="${esc(shop.slug)}">
<section class="hero">${logo}<div class="hero-body"><h1>${esc(shop.shop_name)}</h1>${shop.tagline ? `<p>${esc(shop.tagline)}</p>` : ''}
<div class="follow"><button type="button" id="followButton" data-following="${following ? 1 : 0}">${following ? '★ ホシってます' : '☆ ショップをホシる'}</button><small><span id="followerCount">${followers}</span>人がホシってます</small><small id="followStatus"></small></div></div></section>
${shop.intro ? `<p class="intro">${esc(shop.intro)}</p>` : ''}
${couponHtml}
<section class="shop-section" id="products"><h2>商品</h2>
<form class="search" action="/shop/${esc(shop.slug)}" method="get"><input type="search" name="q" value="${esc(query)}" placeholder="このショップの中で探す" maxlength="80"><button type="submit">探す</button></form>
<div class="grid">${productHtml}</div></section>
<p class="foot">商品リンクは各モールの商品ページへ移動します。HOSHILU は送客に対して事業者から料金を受け取る場合がありますが、検索順位は変わりません。${shop.website_url ? `<br><a href="${esc(shop.website_url)}" rel="nofollow noopener" target="_blank">公式サイト</a>` : ''}</p>
</main>
<script>
(function(){
  var slug=document.querySelector('main').dataset.slug;
  var button=document.getElementById('followButton');var status=document.getElementById('followStatus');var count=document.getElementById('followerCount');
  button.addEventListener('click',function(){
    var following=button.dataset.following==='1';button.disabled=true;
    fetch('/api/member/shops/'+encodeURIComponent(slug)+'/follow',{method:following?'DELETE':'POST',headers:{'content-type':'application/json'},body:'{}'})
      .then(function(r){return r.json().then(function(b){return {status:r.status,body:b};});})
      .then(function(res){
        if(res.status===401){status.innerHTML='<a href="/login.html?next='+encodeURIComponent('/shop/'+slug)+'">無料会員ログイン（30秒）でホシれます →</a>';return;}
        if(!res.body||res.body.ok!==true)throw new Error(res.body&&res.body.error||'FAILED');
        button.dataset.following=res.body.following?'1':'0';button.textContent=res.body.following?'★ ホシってます':'☆ ショップをホシる';count.textContent=res.body.followers;status.textContent=res.body.following?'新着クーポン・商品の通知対象になりました。':'';
      }).catch(function(e){status.textContent='うまくいきませんでした（'+e.message+'）';}).then(function(){button.disabled=false;});
  });
  document.querySelectorAll('.coupon-code').forEach(function(node){node.addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText(node.dataset.code).then(function(){node.textContent='コピーしました';setTimeout(function(){node.textContent=node.dataset.code;},1200);});});});
})();
</script><script type="module" src="/growth-analytics.mjs?v=10"></script></body></html>`;
}

// ---- ルーティング ----------------------------------------------------------------
export async function handleShopRoutes(request, env, { createTrackToken, readMember = readMemberSession, hashUser } = {}) {
  const url = new URL(request.url);
  const db = env.PRODUCT_DB;
  const pageMatch = url.pathname.match(/^\/shop\/([a-z0-9-]{1,40})(?:\/coupon\/([A-Za-z0-9-]{1,64}))?\/?$/);
  const followMatch = url.pathname.match(/^\/api\/member\/shops\/([a-z0-9-]{1,40})\/follow$/);
  if (!pageMatch && !followMatch) return null;
  if (!db) return new Response('shop unavailable', { status: 503 });

  if (followMatch) {
    if (!['POST', 'DELETE'].includes(request.method)) return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
    const shop = await loadShop(db, followMatch[1]);
    if (!shop) return json({ ok: false, error: 'SHOP_NOT_FOUND' }, 404);
    const member = await readMember(request, env);
    if (!member?.id) return json({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, 401);
    const now = new Date().toISOString();
    if (request.method === 'POST') {
      const result = await db.prepare(`INSERT OR IGNORE INTO member_shop_follows(member_id,seller_key,created_at) VALUES(?1,?2,?3)`).bind(member.id, shop.seller_key, now).run();
      if (Number(result?.meta?.changes || 0) > 0) await recordShopEvent(env, 'shop_followed', shop.slug);
      return json({ ok: true, following: true, followers: await followerCount(db, shop.seller_key) });
    }
    const result = await db.prepare(`DELETE FROM member_shop_follows WHERE member_id=?1 AND seller_key=?2`).bind(member.id, shop.seller_key).run();
    if (Number(result?.meta?.changes || 0) > 0) await recordShopEvent(env, 'shop_unfollowed', shop.slug);
    return json({ ok: true, following: false, followers: await followerCount(db, shop.seller_key) });
  }

  if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });
  const shop = await loadShop(db, pageMatch[1]);
  if (!shop) return new Response('ショップが見つかりません', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

  if (pageMatch[2]) {
    const coupon = await db.prepare(`SELECT * FROM seller_shop_coupons WHERE coupon_id=?1 AND seller_key=?2`).bind(pageMatch[2], shop.seller_key).first();
    if (!coupon || !couponIsLive(coupon) || !httpsUrl(coupon.landing_url)) return Response.redirect(`${url.origin}/shop/${shop.slug}#coupons`, 302);
    await recordShopEvent(env, 'coupon_clicked', shop.slug, { content: coupon.coupon_id, marketplace: coupon.marketplace });
    return new Response(null, { status: 302, headers: { location: coupon.landing_url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  }

  const query = clean(url.searchParams.get('q'), 80);
  const member = await readMember(request, env);
  const [coupons, rawProducts, followers] = await Promise.all([
    liveCoupons(db, shop.seller_key), shopProducts(env, shop, query), followerCount(db, shop.seller_key)
  ]);
  const following = member?.id
    ? Boolean(await db.prepare(`SELECT 1 AS f FROM member_shop_follows WHERE member_id=?1 AND seller_key=?2`).bind(member.id, shop.seller_key).first())
    : false;
  const seed = crypto.randomUUID();
  const userHash = hashUser ? await hashUser(member?.id || `shop:${shop.slug}`) : 'shop';
  const products = [];
  for (const [index, product] of rawProducts.entries()) {
    let trackingUrl = product.url;
    if (typeof createTrackToken === 'function' && env.LINK_SIGNING_SECRET) {
      const token = await createTrackToken({
        u: userHash, r: seed, a: product.asin || `SHOP${index}`, d: product.url,
        exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        j: `${seed}:${product.asin || index}:SHOP`, c: 'PWA', m: product.marketplace,
        sid: shop.seller_ids[0] || '', hpid: '', sp: false, so: 'HOSHILU_SHOP', tn: product.tenant, rc: 'other', sh: shop.slug
      }, env.LINK_SIGNING_SECRET);
      trackingUrl = `${url.origin}/go?token=${encodeURIComponent(token)}`;
    }
    products.push({ ...product, tracking_url: trackingUrl });
  }
  await recordShopEvent(env, 'shop_viewed', shop.slug, { content: query ? 'search' : 'view' });
  const html = renderShopHtml({ shop, coupons, products, followers, following, query, origin: url.origin });
  return new Response(html, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin'
  } });
}

// ---- セラー管理（Business のみ） -----------------------------------------------
async function businessAccount(db, sellerKey) {
  const row = await db.prepare(`SELECT seller_key,account_name,plan,status,tenants FROM seller_billing_accounts WHERE seller_key=?1`).bind(sellerKey).first();
  if (!row) return { ok: false, error: 'BILLING_ACCOUNT_REQUIRED' };
  if (row.plan !== 'BUSINESS' || row.status !== 'ACTIVE') return { ok: false, error: 'BUSINESS_PLAN_REQUIRED' };
  return { ok: true, account: { ...row, tenants: safeList(row.tenants) } };
}

async function shopSummary(db, sellerKey) {
  const shop = await db.prepare(`SELECT * FROM seller_shops WHERE seller_key=?1`).bind(sellerKey).first();
  const coupons = await db.prepare(`SELECT * FROM seller_shop_coupons WHERE seller_key=?1 ORDER BY created_at DESC LIMIT 50`).bind(sellerKey).all();
  const followers = await followerCount(db, sellerKey);
  let views = 0;
  if (shop) {
    try {
      const row = await db.prepare(`SELECT COUNT(*) AS c FROM growth_events WHERE event_type='shop_viewed' AND campaign=?1 AND occurred_at>=datetime('now','-30 days')`).bind(shop.slug).first();
      views = Number(row?.c || 0);
    } catch {}
  }
  return {
    shop: shop ? { ...shop, tenants: safeList(shop.tenants), seller_ids: safeList(shop.seller_ids), url: `/shop/${shop.slug}` } : null,
    coupons: (coupons.results || []).map((c) => ({ ...c, live: couponIsLive(c) })),
    kpi: { followers, views_30d: views }
  };
}

async function upsertShop(db, { sellerKey, input, account, now }) {
  const data = validateShopInput(input);
  const taken = await db.prepare(`SELECT seller_key FROM seller_shops WHERE slug=?1 AND seller_key<>?2`).bind(data.slug, sellerKey).first();
  if (taken) throw new Error('SHOP_SLUG_TAKEN');
  const tenants = Array.isArray(input.tenants) && input.tenants.length ? input.tenants.map((t) => clean(t, 32).toLowerCase()).filter(Boolean) : account.tenants;
  const sellerIds = Array.isArray(input.seller_ids) ? input.seller_ids.map((s) => clean(s, 160)).filter(Boolean) : null;
  await db.prepare(`INSERT INTO seller_shops(seller_key,slug,shop_name,tagline,intro,logo_url,cover_url,website_url,tenants,seller_ids,status,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)
    ON CONFLICT(seller_key) DO UPDATE SET slug=excluded.slug,shop_name=excluded.shop_name,tagline=excluded.tagline,intro=excluded.intro,
      logo_url=excluded.logo_url,cover_url=excluded.cover_url,website_url=excluded.website_url,tenants=excluded.tenants,
      seller_ids=CASE WHEN ?13=1 THEN excluded.seller_ids ELSE seller_shops.seller_ids END,status=excluded.status,updated_at=excluded.updated_at`)
    .bind(sellerKey, data.slug, data.shop_name, data.tagline, data.intro, data.logo_url, data.cover_url, data.website_url,
      JSON.stringify(tenants.slice(0, 10)), JSON.stringify((sellerIds || []).slice(0, 20)), data.status, now, sellerIds ? 1 : 0).run();
  resetShopCache();
  return data;
}

async function handleShopManagement(request, env, sellerKey, { base, adminInput = null }) {
  const url = new URL(request.url);
  const db = env.PRODUCT_DB;
  if (!db) return json({ ok: false, error: 'NO_DB' }, 503);
  const gate = await businessAccount(db, sellerKey);
  const rest = url.pathname.slice(base.length);
  if (request.method === 'GET' && (rest === '' || rest === '/')) {
    return json({ ok: true, ...(gate.ok ? { entitled: true } : { entitled: false, reason: gate.error }), ...(await shopSummary(db, sellerKey)) });
  }
  if (!gate.ok) return json({ ok: false, error: gate.error }, 402);
  let body = adminInput;
  if (!body && request.method !== 'GET') { try { body = await request.json(); } catch { return json({ ok: false, error: 'BODY_INVALID' }, 400); } }
  const now = new Date().toISOString();
  try {
    if ((request.method === 'PUT' || request.method === 'POST') && (rest === '' || rest === '/')) {
      const data = await upsertShop(db, { sellerKey, input: body || {}, account: gate.account, now });
      return json({ ok: true, shop: { ...data, url: `/shop/${data.slug}` }, ...(await shopSummary(db, sellerKey)) });
    }
    if (request.method === 'POST' && rest === '/coupons') {
      const data = validateCouponInput(body || {});
      const couponId = crypto.randomUUID();
      await db.prepare(`INSERT INTO seller_shop_coupons(coupon_id,seller_key,title,code,discount_text,marketplace,landing_url,terms,hoshilu_only,starts_at,ends_at,status,created_at,updated_at)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'ACTIVE',?12,?12)`)
        .bind(couponId, sellerKey, data.title, data.code, data.discount_text, data.marketplace, data.landing_url, data.terms, data.hoshilu_only, data.starts_at, data.ends_at, now).run();
      resetShopCache();
      return json({ ok: true, coupon_id: couponId, ...(await shopSummary(db, sellerKey)) });
    }
    const couponMatch = rest.match(/^\/coupons\/([A-Za-z0-9-]{1,64})$/);
    if (couponMatch && (request.method === 'DELETE' || request.method === 'POST')) {
      const status = request.method === 'DELETE' || body?.status === 'ENDED' ? 'ENDED' : 'ACTIVE';
      await db.prepare(`UPDATE seller_shop_coupons SET status=?3,updated_at=?4 WHERE coupon_id=?1 AND seller_key=?2`).bind(couponMatch[1], sellerKey, status, now).run();
      resetShopCache();
      return json({ ok: true, ...(await shopSummary(db, sellerKey)) });
    }
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) }, 400);
  }
  return json({ ok: false, error: 'NOT_FOUND' }, 404);
}

// セラー画面用: /api/seller/shop, /api/seller/shop/coupons, /api/seller/shop/coupons/:id
export async function handleSellerShopRoutes(request, env, seller) {
  if (!seller?.seller_key) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  return handleShopManagement(request, env, seller.seller_key, { base: '/api/seller/shop' });
}

// 管理者用（セラーがログインできない間の代行）: /api/admin/seller-shops/<seller_key>[/coupons[/:id]]
export async function handleSellerShopAdminRoutes(request, env, authorize) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/seller-shops')) return null;
  if (!await authorize(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (request.method === 'GET' && url.pathname === '/api/admin/seller-shops') {
    const rows = await env.PRODUCT_DB.prepare(`SELECT seller_key,slug,shop_name,status,tenants,updated_at FROM seller_shops ORDER BY updated_at DESC LIMIT 200`).all();
    return json({ ok: true, shops: rows.results || [] });
  }
  const match = url.pathname.match(/^\/api\/admin\/seller-shops\/([A-Za-z0-9_-]{8,64})(\/.*)?$/);
  if (!match) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  const sellerKey = match[1];
  const proxied = new Request(`${url.origin}/api/seller/shop${match[2] || ''}`, request);
  return handleShopManagement(proxied, env, sellerKey, { base: '/api/seller/shop' });
}
