import { sellerPlanEntitlements } from './seller-pricing-policy.mjs';

const esc = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const number = (value) => Number(value || 0).toLocaleString('ja-JP');

export async function sellerPageResponse(
  env = {},
  seller = { account: 'Seller', tenants: ['itg'], plan: 'LITE' }
) {
  const allowed = new Set(seller.tenants || []);
  const entitlements = sellerPlanEntitlements(seller.plan);
  let products = [];
  let demands = [];
  let restrictions = [];
  let syncs = [];
  let marketplaceOffers = [];
  if (env.PRODUCT_DB) {
    try {
      const result = await env.PRODUCT_DB.prepare(
        'SELECT tenant,count(*) AS products FROM products GROUP BY tenant ORDER BY tenant'
      ).all();
      products = (result.results || []).filter((row) => allowed.has(String(row.tenant)));
    } catch {}
    try {
      if (entitlements.advanced_demand_report) {
        const result = await env.PRODUCT_DB.prepare(`SELECT category,
          count(*) AS outbound_count,count(DISTINCT user_hash) AS unique_users,
          max(occurred_at) AS last_seen_at
          FROM unmet_demand_events
          WHERE demand_status='UNMET' AND contract_match=0
            AND traffic_class='ATTRIBUTED'
          GROUP BY category HAVING count(DISTINCT user_hash)>=5
          ORDER BY outbound_count DESC,last_seen_at DESC LIMIT 10`).all();
        demands = result.results || [];
      }
    } catch {}
    try {
      if (entitlements.advanced_demand_report) {
        const result = await env.PRODUCT_DB.prepare(`SELECT tenant,restriction_class,
          sum(anonymous_demand_count) AS demand_count,
          sum(CASE WHEN domestic_alternative_status='VERIFIED'
            THEN anonymous_demand_count ELSE 0 END) AS covered_count
          FROM import_restriction_knowledge GROUP BY tenant,restriction_class
          HAVING sum(anonymous_demand_count)>=5 ORDER BY demand_count DESC LIMIT 30`).all();
        restrictions = (result.results || []).filter((row) => allowed.has(String(row.tenant)));
      }
    } catch {}
    try {
      const result = await env.PRODUCT_DB.prepare(`SELECT tenant,result,items,completed_at
        FROM sp_api_sync_audit ORDER BY completed_at DESC LIMIT 100`).all();
      const seen = new Set();
      syncs = (result.results || []).filter((row) => {
        const tenant = String(row.tenant);
        if (!allowed.has(tenant) || seen.has(tenant)) return false;
        seen.add(tenant);
        return true;
      });
    } catch {}
    try {
      const result = await env.PRODUCT_DB.prepare(`SELECT tenant,marketplace,
        SUM(CASE WHEN active=1
          AND stock_status NOT IN ('OUT_OF_STOCK','UNAVAILABLE')
          AND datetime(observed_at)>=datetime('now','-7 days')
          AND EXISTS(SELECT 1 FROM products p WHERE p.tenant=marketplace_offers.tenant
            AND ((marketplace_offers.asin<>'' AND p.asin=marketplace_offers.asin)
              OR (marketplace_offers.record_key<>'' AND p.record_key=marketplace_offers.record_key)))
          THEN 1 ELSE 0 END) AS verified_products,
        SUM(CASE WHEN active=1
          AND stock_status NOT IN ('OUT_OF_STOCK','UNAVAILABLE')
          AND datetime(observed_at)<datetime('now','-7 days')
          THEN 1 ELSE 0 END) AS stale_products,
        MAX(observed_at) AS last_observed_at
        FROM marketplace_offers GROUP BY tenant,marketplace
        ORDER BY marketplace,tenant`).all();
      marketplaceOffers = (result.results || [])
        .filter((row) => allowed.has(String(row.tenant)));
    } catch {}
  }

  const productTotal = products.reduce((sum, row) => sum + Number(row.products || 0), 0);
  const demandTotal = demands.reduce((sum, row) => sum + Number(row.outbound_count || 0), 0);
  const spApiClientReady = Boolean(env.SPAPI_LWA_CLIENT_ID && env.SPAPI_LWA_CLIENT_SECRET);
  const configuredTenants = spApiClientReady
    ? (seller.tenants || []).filter((tenant) => Boolean(
      env[`SPAPI_REFRESH_TOKEN_${String(tenant).toUpperCase()}`]
    ))
    : [];
  const lineLoginReady = Boolean(env.LINE_LOGIN_CHANNEL_ID && env.LINE_LOGIN_CHANNEL_SECRET);
  const lineMessagingReady = Boolean(env.LINE_CHANNEL_SECRET && env.LINE_CHANNEL_ACCESS_TOKEN);
  const tenantSummary = products.length
    ? products.map((row) => `${esc(row.tenant)}: ${number(row.products)}`).join(' / ')
    : (seller.tenants || []).map(esc).join(' / ') || '未設定';

  const productCards = products.length
    ? products.map((row) => `<article class="seller-panel"><span>${esc(row.tenant)}</span>
      <strong>${number(row.products)}</strong><span>検索カタログ件数</span></article>`).join('')
    : '<article class="seller-panel"><span>商品</span><strong>0</strong><span>未登録</span></article>';

  const demandCards = !entitlements.advanced_demand_report
    ? '<article class="seller-panel"><span>契約機能</span><strong>詳細分析</strong><span>GROWTH以上で利用できます</span></article>'
    : demands.length
      ? demands.map((row) => `<article class="seller-panel"><span>${esc(row.category || '未分類')}</span>
        <strong>${number(row.outbound_count)}</strong>
        <span>Amazon送客 / 匿名セッション ${number(row.unique_users)}件</span></article>`).join('')
      : '<article class="seller-panel"><span>プライバシー保護</span><strong>集計待ち</strong><span>流入元付きの匿名セッション5件以上だけを表示します</span></article>';

  const restrictionCards = !entitlements.advanced_demand_report
    ? '<article class="seller-panel"><span>契約機能</span><strong>詳細分析</strong><span>GROWTH以上で利用できます</span></article>'
    : restrictions.length
      ? restrictions.map((row) => `<article class="seller-panel"><span>${esc(row.restriction_class)}</span>
        <strong>${number(row.demand_count)}</strong>
        <span>国内代替確認済み ${number(row.covered_count)}件</span></article>`).join('')
      : '<article class="seller-panel"><span>プライバシー保護</span><strong>集計待ち</strong><span>同一区分が5件以上になると表示します</span></article>';

  const syncSummary = syncs.length
    ? syncs.map((row) => `${esc(row.tenant)} ${esc(row.result)} ${number(row.items)}件`).join(' / ')
    : '同期実績待ち';
  const marketplaceNames = {
    RAKUTEN_JP: '楽天市場',
    QOO10_JP: 'Qoo10',
    SHEIN_JP: 'SHEIN'
  };
  const marketplaceCards = Object.entries(marketplaceNames).map(([marketplace, label]) => {
    const rows = marketplaceOffers.filter((row) => String(row.marketplace) === marketplace);
    const verified = rows.reduce((sum, row) => sum + Number(row.verified_products || 0), 0);
    const stale = rows.reduce((sum, row) => sum + Number(row.stale_products || 0), 0);
    const state = verified > 0
      ? `確認済み商品URL${number(verified)}件`
      : '確認済み商品URLなし';
    const note = stale > 0
      ? `再確認期限超過 ${number(stale)}件`
      : verified > 0 ? '7日以内に確認済み' : '商品URLフィードの接続が必要';
    return `<article class="seller-panel"><span>${label}</span><strong>${state}</strong><span>${note}</span></article>`;
  }).join('');

  const html = `<!doctype html><html lang="ja"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#7357ff"><meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="/icons/icon.svg"><link rel="stylesheet" href="/auth.css">
  <style>
  .seller-shell .auth-card{margin-bottom:18px;scroll-margin-top:24px}
  .seller-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:22px}
  .seller-actions a{display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none}
  @media(max-width:700px){.seller-actions{grid-template-columns:1fr 1fr}.seller-actions a:last-child{grid-column:1/-1}}
  </style><title>メーカー・セラー管理 | HOSHILU</title></head><body>
  <header class="auth-top"><a class="auth-brand" href="/"><img src="/icons/icon.svg" width="42" height="42" alt=""><span>HOSHILU FOR BUSINESS</span></a>
  <div class="auth-actions"><button id="sellerLogout" class="ghost-button" type="button">ログアウト</button></div></header>
  <main class="seller-shell">
  <section class="auth-card"><p class="eyebrow">MAKER &amp; SELLER CONSOLE</p>
  <h1>${esc(seller.account)} 管理画面</h1>
  <p>契約プラン: <strong>${esc(seller.plan)}</strong> / 対象店舗: ${tenantSummary}</p>
  <nav class="seller-actions" aria-label="管理メニュー">
  <a class="primary-button" href="#catalog">商品管理</a><a class="primary-button" href="#offers">購入先管理</a>
  <a class="primary-button" href="#demand">需要分析</a><a class="primary-button" href="#integration">データ連携</a>
  <a class="primary-button" href="#plan">契約プラン</a></nav></section>

  <section class="auth-card"><p class="eyebrow">AMAZON SP-API</p><h2>Amazon商品同期</h2>
  <p>3店舗の接続状態、最終同期、出品件数を確認し、全件同期を実行できます。</p>
  <div class="seller-grid">
  <article class="seller-panel"><span>LWAアプリ認証</span><strong>${spApiClientReady ? '設定済み' : '未設定'}</strong><span>Client ID・Secretの値は表示しません</span></article>
  <article class="seller-panel"><span>店舗認可</span><strong>${configuredTenants.length}/${allowed.size}</strong><span>Refresh Token登録済み店舗</span></article>
  </div>
  <a class="primary-button" href="/seller/sp-api">SP-API同期画面を開く</a></section>

  <section class="seller-grid">
  <article class="seller-panel"><span>対象店舗</span><strong>${allowed.size}</strong><span>${tenantSummary}</span></article>
  <article class="seller-panel"><span>検索カタログ</span><strong>${number(productTotal)}</strong><span>対象店舗の商品総数</span></article>
  <article class="seller-panel"><span>未充足Amazon送客</span><strong>${number(demandTotal)}</strong><span>契約商品で満たせなかった需要</span></article>
  </section>

  <section class="auth-card" id="catalog"><p class="eyebrow">CATALOG</p><h2>商品管理</h2>
  <p>対象店舗に紐づく検索カタログ件数です。販売中商品としての公開は、Amazon出品同期と照合の合格後に行います。</p>
  <div class="seller-grid">${productCards}</div></section>

  <section class="auth-card" id="offers"><p class="eyebrow">OFFERS</p><h2>購入先管理</h2>
  <p>同一ASINに複数の販売先がある場合は、契約条件と有効な出品状態に従って購入先を選びます。在庫切れや出品停止時は公開候補から外します。</p>
  <a class="ghost-button" href="/seller/sp-api">Amazon出品を確認する</a></section>

  <section class="auth-card" id="demand"><p class="eyebrow">DEMAND</p><h2>契約商品で満たせなかった需要</h2>
  <p>個人を特定しないカテゴリ集計です。QA・流入元なし・過去不明の記録を除外し、流入元付きの匿名セッションが5件以上あるカテゴリだけを表示します。セッション件数は人数を意味しません。</p>
  <div class="seller-grid">${demandCards}</div></section>

  <section class="auth-card" id="restrictions"><p class="eyebrow">IMPORT KNOWLEDGE</p><h2>輸入制限と国内代替需要</h2>
  <p>注文番号や顧客情報を含まない月次集計です。</p><div class="seller-grid">${restrictionCards}</div></section>

  <section class="auth-card" id="integration"><p class="eyebrow">DATA CONNECTION</p><h2>CSV・API連携</h2>
  <div class="seller-grid">
  <article class="seller-panel"><span>CSV</span><strong>一括取込</strong><span>ASIN・在庫・価格・購入先URL・出品状態を更新</span></article>
  <article class="seller-panel"><span>API</span><strong>自動同期</strong><span>商品・在庫・出品停止を継続同期</span></article>
  <article class="seller-panel"><span>Amazon SP-API</span><strong>${configuredTenants.length}/${allowed.size} 接続</strong><span>${syncSummary}。認証情報は表示しません</span></article>
  </div></section>

  <section class="auth-card" id="marketplaces"><p class="eyebrow">MARKETPLACE URL HEALTH</p>
  <h2>楽天市場・Qoo10・SHEINの商品URL</h2>
  <p>検索結果へ直接購入ボタンを表示できるのは、商品照合済み・販売中・7日以内に確認した商品詳細URLだけです。</p>
  <div class="seller-grid">${marketplaceCards}</div></section>

  <section class="auth-card" id="line"><p class="eyebrow">LINE</p><h2>LINE接続状況</h2>
  <div class="seller-grid">
  <article class="seller-panel"><span>LINEログイン</span><strong>${lineLoginReady ? '設定済み' : '未設定'}</strong><span>ユーザー認証</span></article>
  <article class="seller-panel"><span>公式アカウント</span><strong>${lineMessagingReady ? '接続済み' : '未接続'}</strong><span>通知・応答Webhook</span></article>
  </div></section>

  <section class="auth-card" id="plan"><p class="eyebrow">SELLER PLAN</p><h2>契約プラン</h2>
  <p>有料契約によって商品そのものの検索順位は変わりません。プラン差は購入先の優先条件と、利用できる分析・連携機能にのみ適用します。</p></section>
  </main><script type="module" src="/seller.js"></script></body></html>`;

  return new Response(html, { headers: {
    'content-type': 'text/html; charset=UTF-8',
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    'x-content-type-options': 'nosniff'
  } });
}
