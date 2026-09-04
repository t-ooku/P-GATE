import { sellerPlanEntitlements } from './seller-pricing-policy.mjs';
import { SP_API_SELLERS } from './sp-api-sync.mjs';

const esc = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const number = (value) => Number(value || 0).toLocaleString('ja-JP');
const yenFromMicros = (value) => `¥${number(Math.round(Number(value || 0) / 1_000_000))}`;
const tenantDisplay = (tenant) => {
  const normalized = String(tenant || '').trim().toLowerCase();
  return {
    code: normalized ? normalized.toUpperCase() : 'STORE',
    name: SP_API_SELLERS[normalized]?.storeName || normalized || '未設定'
  };
};
const tenantText = (tenant) => {
  const store = tenantDisplay(tenant);
  return `${store.name}（${store.code}）`;
};
const safeDate = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(date)
    : '記録なし';
};

export async function sellerPageResponse(
  env = {},
  seller = { account: 'Seller', tenants: ['itg'], plan: 'LITE' },
  searchParams = new URLSearchParams()
) {
  const allowed = new Set(seller.tenants || []);
  const entitlements = sellerPlanEntitlements(seller.plan);
  const publicPlan = entitlements.advanced_demand_report ? 'Business' : 'Seller';
  let products = [];
  let demands = [];
  let restrictions = [];
  let syncs = [];
  let marketplaceOffers = [];
  let targetPriceDemands = [];
  let priorityRules = [];
  let wallet = null;
  let billingStats = null;
  let referralStats = null;
  let referralMarketplaces = [];
  const demandQuery=String(searchParams?.get?.('demand_query')||'').normalize('NFKC').trim().slice(0,80);
  const demandMin=Math.max(0,Math.min(100000000,Number(searchParams?.get?.('demand_min'))||0));
  const demandMax=Math.max(demandMin,Math.min(100000000,Number(searchParams?.get?.('demand_max'))||100000000));
  if (env.PRODUCT_DB) {
    try {
      if (entitlements.target_price_demand) {
        const result = await env.PRODUCT_DB.prepare(`SELECT json_extract(condition_snapshot,'$.price_condition.target_product_name') AS target_product_name,
          count(DISTINCT member_id) AS interested_users,
          min(CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)) AS min_target_price_jpy,
          round(avg(CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER))) AS average_target_price_jpy,
          max(CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)) AS max_target_price_jpy,
          max(updated_at) AS last_updated_at
          FROM member_wishes
          WHERE CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)>=100
            AND json_extract(condition_snapshot,'$.price_condition.target_product_name') LIKE ?1 ESCAPE '\\'
            AND CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER) BETWEEN ?2 AND ?3
          GROUP BY json_extract(condition_snapshot,'$.price_condition.target_product_name') HAVING count(DISTINCT member_id)>=5
          ORDER BY interested_users DESC,last_updated_at DESC LIMIT 100`)
          .bind(`%${demandQuery.replace(/[\\%_]/g,'\\$&')}%`,demandMin,demandMax).all();
        targetPriceDemands=result.results||[];
      }
    } catch {}
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
    const sellerKey = String(seller.seller_key || '');
    if (/^[A-Za-z0-9_-]{20,120}$/u.test(sellerKey)) {
      try {
        const result = await env.PRODUCT_DB.prepare(`SELECT rule_id,tenant,scope_type,scope_value,
          active,priority_started_at,updated_at FROM seller_priority_rules
          WHERE seller_key=?1 ORDER BY tenant,active DESC,priority_started_at,rule_id`)
          .bind(sellerKey).all();
        priorityRules = (result.results || []).filter((row) => allowed.has(String(row.tenant)));
      } catch {}
      try {
        wallet = await env.PRODUCT_DB.prepare(`SELECT currency,balance_micros_jpy,
          reserved_micros_jpy,status,updated_at FROM seller_billing_wallets
          WHERE seller_key=?1`).bind(sellerKey).first();
      } catch {}
      try {
        billingStats = await env.PRODUCT_DB.prepare(`SELECT
          COUNT(CASE WHEN status='SETTLED' AND datetime(occurred_at)>=datetime('now','-30 days') THEN 1 END) AS settled_clicks_30d,
          COALESCE(SUM(CASE WHEN status='SETTLED' AND datetime(occurred_at)>=datetime('now','-30 days') THEN amount_micros_jpy ELSE 0 END),0) AS spend_micros_30d,
          COUNT(CASE WHEN status='PENDING' THEN 1 END) AS pending_clicks,
          COALESCE(SUM(CASE WHEN status='SETTLED' THEN amount_micros_jpy ELSE 0 END),0) AS lifetime_spend_micros
          FROM seller_qualified_click_charges WHERE seller_key=?1`).bind(sellerKey).first();
      } catch {}
    }
    const tenants = [...allowed];
    if (tenants.length) {
      try {
        const placeholders = tenants.map((_, index) => `?${index + 1}`).join(',');
        const sellerIdsResult = await env.PRODUCT_DB.prepare(`SELECT DISTINCT seller_id
          FROM marketplace_offers WHERE tenant IN (${placeholders}) AND seller_id<>''
          ORDER BY seller_id LIMIT 100`).bind(...tenants).all();
        const sellerIdsSet = new Set((sellerIdsResult.results || [])
          .map((row) => String(row.seller_id || '')).filter(Boolean));
        try {
          const spApiSellerIds = await env.PRODUCT_DB.prepare(`SELECT DISTINCT merchant_id AS seller_id
            FROM sp_api_listings WHERE tenant IN (${placeholders}) AND merchant_id<>''
            ORDER BY merchant_id LIMIT 100`).bind(...tenants).all();
          for (const row of spApiSellerIds.results || []) {
            const id = String(row.seller_id || '');
            if (id) sellerIdsSet.add(id);
          }
        } catch {}
        const sellerIds = [...sellerIdsSet].slice(0, 100);
        if (sellerIds.length) {
          const ids = sellerIds.map((_, index) => `?${index + 1}`).join(',');
          referralStats = await env.PRODUCT_DB.prepare(`SELECT COUNT(*) AS clicks_30d,
            COUNT(DISTINCT session_id) AS sessions_30d,
            SUM(CASE WHEN organic_or_sponsored='SPONSORED' THEN 1 ELSE 0 END) AS priority_clicks_30d,
            MAX(occurred_at) AS last_click_at FROM outbound_commerce_events
            WHERE seller_id IN (${ids}) AND datetime(occurred_at)>=datetime('now','-30 days')`)
            .bind(...sellerIds).first();
          const byMarketplace = await env.PRODUCT_DB.prepare(`SELECT destination_marketplace,
            COUNT(*) AS clicks,COUNT(DISTINCT session_id) AS sessions,
            SUM(CASE WHEN organic_or_sponsored='SPONSORED' THEN 1 ELSE 0 END) AS priority_clicks
            FROM outbound_commerce_events WHERE seller_id IN (${ids})
              AND datetime(occurred_at)>=datetime('now','-30 days')
            GROUP BY destination_marketplace ORDER BY clicks DESC,destination_marketplace`)
            .bind(...sellerIds).all();
          referralMarketplaces = byMarketplace.results || [];
        }
      } catch {}
    }
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
    ? products.map((row) => `${esc(tenantText(row.tenant))}: ${number(row.products)}`).join(' / ')
    : (seller.tenants || []).map((tenant) => esc(tenantText(tenant))).join(' / ') || '未設定';

  const productCards = products.length
    ? products.map((row) => {
      const store = tenantDisplay(row.tenant);
      return `<article class="seller-panel"><span>${esc(store.name)} · ${esc(store.code)}</span>
        <strong>${number(row.products)}</strong><span>この店舗に紐づく検索用の商品データ件数です。現在販売中または検索画面に表示中の商品数とは限りません。</span></article>`;
    }).join('')
    : '<article class="seller-panel"><span>商品</span><strong>0</strong><span>未登録</span></article>';

  const demandCards = !entitlements.advanced_demand_report
    ? '<article class="seller-panel"><span>契約機能</span><strong>詳細分析</strong><span>Businessで利用できます</span></article>'
    : demands.length
      ? demands.map((row) => `<article class="seller-panel"><span>${esc(row.category || '未分類')}</span>
        <strong>${number(row.outbound_count)}</strong>
        <span>Amazon送客 / 匿名セッション ${number(row.unique_users)}件</span></article>`).join('')
      : '<article class="seller-panel"><span>プライバシー保護</span><strong>集計待ち</strong><span>流入元付きの匿名セッション5件以上だけを表示します</span></article>';

  const restrictionCards = !entitlements.advanced_demand_report
    ? '<article class="seller-panel"><span>契約機能</span><strong>詳細分析</strong><span>Businessで利用できます</span></article>'
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
    return `<article class="seller-panel"><span>${label}</span><strong>${state}</strong><span>${note}</span>
      <p class="metric-help">検索結果から商品詳細ページへ直接送客できるURLの確認状況です。商品数や売上件数ではありません。</p></article>`;
  }).join('');
  const targetDemandRows=!entitlements.target_price_demand
    ? '<tr><td colspan="5">サブスク加入後に利用できます。</td></tr>'
    : targetPriceDemands.length
      ? targetPriceDemands.map(row=>`<tr><td>${esc(row.target_product_name)}</td><td>${number(row.interested_users)}人以上</td><td>¥${number(row.min_target_price_jpy)}</td><td>¥${number(row.average_target_price_jpy)}</td><td>¥${number(row.max_target_price_jpy)}</td></tr>`).join('')
      : '<tr><td colspan="5">匿名希望者が5人以上集まった商品を表示します。現在の条件では集計待ちです。</td></tr>';
  const scopeLabels = {
    ALL: '全商品', CATEGORY: 'ジャンル', BRAND: 'ブランド', MANUFACTURER: 'メーカー',
    INVENTORY_MIN: '最低在庫数', AI_RECOMMENDED: 'AI推奨'
  };
  const scopeValueDisplay = (row) => {
    if (row.scope_type === 'ALL') return 'すべての商品';
    if (row.scope_type === 'AI_RECOMMENDED') return 'AI推奨と判定された商品';
    if (row.scope_type === 'INVENTORY_MIN') return `${row.scope_value}個以上`;
    return row.scope_value;
  };
  const inclusionRules = priorityRules.filter((row) =>
    Number(row.active) === 1 && ['ALL','CATEGORY','BRAND','MANUFACTURER','AI_RECOMMENDED'].includes(String(row.scope_type))
  );
  const walletAvailable = Boolean(wallet);
  const availableMicros = walletAvailable
    ? Math.max(0, Number(wallet.balance_micros_jpy || 0) - Number(wallet.reserved_micros_jpy || 0)) : 0;
  const priorityFunded = walletAvailable && wallet.status === 'ACTIVE' && availableMicros > 0;
  const priorityState = inclusionRules.length ? (priorityFunded ? '運用中' : '開始待ち') : '停止中';
  const readiness = !walletAvailable
    ? {
      state: 'blocked', title: '決済・チャージ機能は接続準備中です',
      body: '優先出品の条件は保存できますが、利用可能残高を接続するまで実際の優先表示と課金は開始されません。入金済みと誤認させる残高は表示しません。'
    }
    : wallet.status !== 'ACTIVE'
      ? {
        state: 'blocked', title: '請求アカウントが停止中です',
        body: '現在の設定は保持されていますが、請求アカウントが有効になるまで優先表示は開始されません。'
      }
      : availableMicros <= 0
        ? {
          state: 'blocked', title: '利用可能残高がありません',
          body: '現在の設定は保持されていますが、利用可能残高が追加されるまで優先表示は開始されません。'
        }
        : inclusionRules.length
          ? {
            state: 'ready', title: '優先出品を運用中です',
            body: '在庫・商品URL・検索適合の条件を満たす購入先だけを、同一商品内の優先枠へ表示します。'
          }
          : {
            state: 'idle', title: '優先出品は停止中です',
            body: '利用可能残高は接続済みです。全商品または条件指定のルールを設定すると優先出品を開始できます。'
          };
  const priorityRuleRows = priorityRules.length
    ? priorityRules.map((row) => `<tr><td data-label="店舗"><strong>${esc(tenantDisplay(row.tenant).name)}</strong><small>${esc(tenantDisplay(row.tenant).code)}</small></td><td data-label="対象">${esc(scopeLabels[row.scope_type] || row.scope_type)}</td>
      <td data-label="条件">${esc(scopeValueDisplay(row))}</td>
      <td data-label="設定状態"><span class="status-pill ${Number(row.active) === 1 ? 'is-active' : 'is-paused'}">${Number(row.active) === 1 ? '有効' : '停止'}</span></td>
      <td data-label="基準日時">${esc(safeDate(row.priority_started_at))}</td><td data-label="操作"><button class="compact-button" type="button"
        data-priority-action="SET_RULE_STATUS" data-rule-id="${esc(row.rule_id)}" data-active="${Number(row.active) === 1 ? '0' : '1'}">
        ${Number(row.active) === 1 ? '停止' : '再開'}</button></td></tr>`).join('')
    : '<tr><td colspan="6">優先出品ルールは未登録です。店舗カードの「全商品を対象に設定」または条件指定から開始できます。</td></tr>';
  const tenantPriorityCards = [...allowed].map((tenant) => {
    const rows = priorityRules.filter((row) => String(row.tenant) === tenant && Number(row.active) === 1);
    const inclusionRows = rows.filter((row) => ['ALL','CATEGORY','BRAND','MANUFACTURER','AI_RECOMMENDED'].includes(String(row.scope_type)));
    const enabled = inclusionRows.length > 0;
    const allActive = inclusionRows.some((row) => String(row.scope_type) === 'ALL');
    const store = tenantDisplay(tenant);
    const state = enabled
      ? priorityFunded ? (allActive ? '全商品で運用中' : '条件指定で運用中') : '設定済み・開始待ち'
      : '停止中';
    const stateClass = enabled ? (priorityFunded ? 'is-running' : 'is-waiting') : 'is-stopped';
    const explanation = enabled
      ? priorityFunded ? '条件を満たす購入先を優先枠へ表示しています。' : '設定は保存済みです。残高接続まで優先表示は始まりません。'
      : '優先出品ルールは設定されていません。';
    const action = enabled
      ? `<button class="danger-button priority-store-action" type="button" data-priority-action="SET_ALL" data-tenant="${esc(tenant)}" data-active="0">この店舗の設定をすべて停止</button>`
      : `<button class="primary-button priority-store-action" type="button" data-priority-action="SET_ALL" data-tenant="${esc(tenant)}" data-active="1">${priorityFunded ? '全商品で優先出品を開始' : '全商品を対象に設定'}</button>`;
    return `<article class="seller-panel priority-store-card">
      <div class="store-identity"><span>Amazon店舗 · ${esc(store.code)}</span><h3>${esc(store.name)}</h3></div>
      <span class="priority-state ${stateClass}">${state}</span>
      <p>${explanation}</p>
      <div class="priority-store-meta"><div><span>保存済みの対象指定</span><small>全商品・ジャンル・ブランド・メーカー・AI推奨のうち、現在有効な設定数です。商品数や表示回数ではありません。</small></div><strong>${number(inclusionRows.length)}件</strong></div>
      <div class="priority-store-actions">${action}<a href="#priority-settings">条件を指定する</a></div>
      </article>`;
  }).join('');
  const tenantOptions = [...allowed].map((tenant) => `<option value="${esc(tenant)}">${esc(tenantText(tenant))}</option>`).join('');
  const spendMicros30d = Number(billingStats?.spend_micros_30d || 0);
  const settledClicks30d = Number(billingStats?.settled_clicks_30d || 0);
  const averageCostMicros = settledClicks30d > 0 ? spendMicros30d / settledClicks30d : 0;
  const marketplaceReferralRows = referralMarketplaces.length
    ? referralMarketplaces.map((row) => `<tr><td>${esc(row.destination_marketplace)}</td><td>${number(row.clicks)}</td>
      <td>${number(row.sessions)}</td><td>${number(row.priority_clicks)}</td></tr>`).join('')
    : '<tr><td colspan="4">販売先を特定できる送客イベントはまだありません。</td></tr>';
  const referralClicks = Number(referralStats?.clicks_30d || 0);
  const referralSessions = Number(referralStats?.sessions_30d || 0);
  const priorityClicks = Number(referralStats?.priority_clicks_30d || 0);

  const html = `<!doctype html><html lang="ja"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#7357ff"><meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="/icons/icon.svg"><link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/seller-console.css">
  <title>メーカー・セラー管理 | HOSHILU</title></head><body>
  <header class="auth-top"><a class="auth-brand" href="/"><img src="/icons/icon.svg" width="42" height="42" alt=""><span>HOSHILU FOR BUSINESS</span></a>
  <div class="auth-actions"><button id="sellerLogout" class="ghost-button" type="button">ログアウト</button></div></header>
  <main class="seller-shell">
  <section class="auth-card"><p class="eyebrow">MAKER &amp; SELLER CONSOLE</p>
  <h1>${esc(seller.account)} 管理画面</h1>
  <p>契約プラン: <strong>${publicPlan}</strong> / 対象店舗: ${tenantSummary}</p>
  <p class="section-intro">商品情報、HOSHILUから各モールへの送客、優先出品の設定、確定した請求状況を確認する画面です。表示する件数は項目ごとに集計対象が異なるため、各数字の下にある説明もあわせて確認してください。</p>
  <nav class="seller-actions" aria-label="管理メニュー">
  <a class="primary-button" href="#performance">成果</a><a class="primary-button" href="#priority">優先出品</a>
  <a class="primary-button" href="#catalog">商品管理</a><a class="primary-button" href="#offers">購入先管理</a><a class="primary-button" href="#demand">需要分析</a>
  <a class="primary-button" href="#integration">データ連携</a><a class="primary-button" href="#plan">契約プラン</a></nav></section>

  <section class="auth-card"><p class="eyebrow">AMAZON SP-API</p><h2>Amazon商品同期</h2>
  <p>3店舗の接続状態、最終同期、出品件数を確認し、全件同期を実行できます。</p>
  <div class="seller-grid">
  <article class="seller-panel"><span>LWAアプリ認証</span><strong>${spApiClientReady ? '設定済み' : '未設定'}</strong><span>Amazon SP-APIへ接続するアプリ側の認証状態です。安全のためClient ID・Secretの値そのものは表示しません。</span></article>
  <article class="seller-panel"><span>店舗認可</span><strong>${configuredTenants.length}/${allowed.size}</strong><span>管理対象店舗のうち、Amazonから商品情報を取得するRefresh Tokenが登録済みの店舗数です。</span></article>
  </div>
  <a class="primary-button" href="/seller/sp-api">SP-API同期画面を開く</a></section>

  <section class="seller-grid">
  <article class="seller-panel"><span>対象店舗</span><strong>${allowed.size}</strong><span>${tenantSummary}</span><p class="metric-help">このログインアカウントから閲覧・設定できる店舗数です。</p></article>
  <article class="seller-panel"><span>検索カタログ</span><strong>${number(productTotal)}</strong><span>対象店舗に紐づく商品データの総数です。現在販売中または検索表示中の商品数と必ずしも一致しません。</span></article>
  <article class="seller-panel"><span>優先出品</span><strong>${priorityState}</strong><span>保存済みの対象指定 ${number(inclusionRules.length)}件</span><p class="metric-help">対象指定の件数であり、対象商品数や優先表示回数ではありません。残高未接続時は設定済みでも優先表示されません。</p></article>
  <article class="seller-panel"><span>過去30日の総送客クリック</span><strong>${number(referralClicks)}</strong><span>匿名セッション ${number(referralSessions)}件</span><p class="metric-help">HOSHILUから販売先の商品ページへ移動した回数です。売上件数や購入者数ではありません。</p></article>
  </section>

  <section class="auth-card" id="performance"><p class="eyebrow">PERFORMANCE &amp; BILLING</p><h2>送客成果と消化状況</h2>
  <p>自然検索からの送客は課金しません。消化額には、不正・重複を除外して請求台帳で確定した優先出品クリックだけを集計します。</p>
  <div class="term-guide" aria-label="成果指標の説明">
    <div><strong>クリック</strong><span>購入先ボタンから販売先ページへ移動した回数です。購入完了を意味しません。</span></div>
    <div><strong>匿名セッション</strong><span>同じ閲覧のまとまりを個人が分からない形で数えた値です。人数とは一致しません。</span></div>
    <div><strong>請求確定</strong><span>不正判定と24時間の重複除外を終え、請求台帳に確定した優先出品クリックです。</span></div>
  </div>
  <div class="seller-grid metric-grid">
  <article class="seller-panel"><span>30日総送客クリック</span><strong>${number(referralClicks)}</strong><span>過去30日間に販売先を特定できた購入先リンクが押された総回数です。自然検索と優先出品の両方を含みます。</span></article>
  <article class="seller-panel"><span>30日優先出品クリック</span><strong>${number(priorityClicks)}</strong><span>過去30日間に、署名付きリンクによって優先出品枠からの送客と確認できた回数です。請求確定前のクリックも含みます。</span></article>
  <article class="seller-panel"><span>30日請求確定クリック</span><strong>${number(settledClicks30d)}</strong><span>優先出品クリックのうち、不正判定と24時間の重複除外を終えて請求対象になった回数です。</span></article>
  <article class="seller-panel"><span>30日消化額</span><strong>${yenFromMicros(spendMicros30d)}</strong><span>過去30日間の請求確定クリックで前払い残高から消化した合計です。確定クリック平均は ${yenFromMicros(averageCostMicros)} です。</span></article>
  <article class="seller-panel"><span>利用可能残高</span><strong>${walletAvailable ? yenFromMicros(availableMicros) : '未接続'}</strong>
    <span>${walletAvailable ? `総残高から確保中の金額を除いた、優先出品に使用できる金額です。状態 ${esc(wallet.status)} / 更新 ${esc(safeDate(wallet.updated_at))}` : '決済・チャージ機能の接続前です。推測や仮の残高は表示しません。'}</span></article>
  <article class="seller-panel"><span>確定前クリック</span><strong>${number(billingStats?.pending_clicks || 0)}</strong><span>請求判定中の優先出品クリックです。確定するまでは利用可能残高から消化しません。</span></article>
  </div>
  <div class="seller-table-wrap"><table><thead><tr><th>送客先</th><th>クリック</th><th>匿名セッション</th><th>優先出品</th></tr></thead>
  <tbody>${marketplaceReferralRows}</tbody></table></div>
  <p class="data-note">最終送客: ${esc(safeDate(referralStats?.last_click_at))}。クリック数は売上件数ではありません。</p></section>

  <section class="auth-card" id="priority"><p class="eyebrow">PRIORITY LISTING</p><h2>優先出品・掲載停止</h2>
  <p>商品そのものの自然検索順位は変えません。同一商品の購入先が複数ある場合だけ、在庫・URL・残高の条件を満たす優先出品を先着順で表示します。停止後に再開したルールは再開日時から並び直します。</p>
  <div class="term-guide" aria-label="優先出品の説明">
    <div><strong>自然検索</strong><span>商品自体の検索順位です。有料契約や優先出品によって順位を上げません。</span></div>
    <div><strong>優先出品</strong><span>同じ商品の購入先が複数ある場合に、条件を満たす店舗の購入先を先に表示する仕組みです。</span></div>
    <div><strong>先着順</strong><span>同じ条件を満たす店舗が複数ある場合は、優先出品を開始した日時が早い設定を先に扱います。</span></div>
  </div>
  <div class="priority-readiness is-${readiness.state}">
    <div><span class="priority-readiness-label">現在の状態</span><strong>${esc(readiness.title)}</strong><p>${esc(readiness.body)}</p></div>
    <a class="ghost-button" href="#performance">残高と成果を確認</a>
  </div>
  <div id="sellerPriorityStatus" class="operation-status" role="status" aria-live="polite"></div>
  <div class="seller-grid priority-store-grid">${tenantPriorityCards}</div>
  <details id="priority-settings" class="priority-settings">
    <summary><span><strong>条件を指定して優先出品する</strong><small>ジャンル・ブランド・メーカー・在庫・AI推奨</small></span><span class="summary-action">設定を開く</span></summary>
    <div class="priority-forms">
    <form id="sellerPriorityRuleForm" class="auth-form priority-form">
      <h3>条件を追加</h3>
      <p>選んだ店舗のうち、指定したジャンル・ブランド・メーカーに一致する商品をまとめて優先出品の候補にします。</p>
      <label><span>店舗</span><select name="tenant" required>${tenantOptions}</select></label>
      <label><span>一括条件</span><select name="scope_type" required>
        <option value="CATEGORY">ジャンル</option><option value="BRAND">ブランド</option><option value="MANUFACTURER">メーカー</option>
      </select></label>
      <p class="field-help">ジャンルは検索カタログの分類、ブランドとメーカーは登録情報との一致で判定します。</p>
      <label><span>条件名</span><input name="scope_value" maxlength="80" required placeholder="例：カラーコンタクト"><small>対象にしたいジャンル名・ブランド名・メーカー名を、商品データに登録されている表記で入力します。</small></label>
      <button class="primary-button" type="submit">この条件を追加</button>
    </form>
    <form id="sellerInventoryRuleForm" class="auth-form priority-form">
      <h3>在庫条件</h3>
      <p>他の対象指定に追加する安全条件です。確認できた在庫数がこの値以上の商品だけを優先出品の候補にします。</p>
      <label><span>店舗</span><select name="tenant" required>${tenantOptions}</select></label>
      <label><span>最低在庫数</span><input name="scope_value" type="number" min="0" max="1000000" value="1" required><small>在庫数を確認できない商品、または入力値を下回る商品は優先表示しません。</small></label>
      <button class="ghost-button" type="submit">在庫条件を保存</button>
    </form>
    <form id="sellerAiRuleForm" class="auth-form priority-form">
      <h3>AI推奨一括反映</h3>
      <p>HOSHILUが検索内容との適合を確認し、AI推奨対象と判定した商品だけを優先出品の候補にする対象指定です。</p>
      <label><span>店舗</span><select name="tenant" required>${tenantOptions}</select><small>AI推奨を適用するAmazon店舗を選びます。</small></label>
      <p class="field-help">在庫・商品URL・利用可能残高など、通常の優先出品条件にも合格した場合だけ表示されます。設定しただけで掲載や売上を保証する機能ではありません。</p>
      <label class="toggle-field"><input name="active" type="checkbox" checked><span>AI推奨を有効にする</span></label>
      <button class="ghost-button" type="submit">AI推奨設定を保存</button>
    </form>
    </div>
  </details>
  <details class="priority-rules">
    <summary class="priority-rules-heading"><div><h3>保存済みの設定</h3><p>有効・停止中を含む、店舗ごとの対象指定と判定条件です。</p></div><span>${number(priorityRules.length)}件・確認</span></summary>
    <div class="setting-guide"><strong>一覧の見方</strong><span>「有効」は対象指定として保存されている状態です。残高未接続などで優先表示が開始していない場合もあります。「優先順の基準日時」は同条件の先着順に使う日時で、再開すると更新されます。</span></div>
    <div class="seller-table-wrap"><table><thead><tr><th>店舗</th><th>対象</th><th>条件</th><th>設定状態</th><th>優先順の基準日時</th><th>操作</th></tr></thead>
    <tbody>${priorityRuleRows}</tbody></table></div>
    <p class="data-note">「この店舗の設定をすべて停止」は、ジャンル・ブランド・メーカー・AI推奨を含む全ルールを停止します。商品数が多いため、商品1件ずつの操作は設けていません。</p>
  </details></section>

  <section class="auth-card" id="catalog"><p class="eyebrow">CATALOG</p><h2>商品管理</h2>
  <p>対象店舗に紐づく検索用の商品データを確認します。ここに表示される数は登録済みデータの件数であり、そのまま現在販売中の商品数や検索画面への表示件数を意味しません。販売中商品としての公開は、Amazon出品同期と照合の合格後に行います。</p>
  <div class="seller-grid">${productCards}</div></section>

  <section class="auth-card" id="offers"><p class="eyebrow">OFFERS</p><h2>購入先管理</h2>
  <p>購入先とは、検索結果の商品からAmazonなどの販売ページへ移動するためのリンクです。同一ASINに複数の販売先がある場合は、検索適合・販売中・確認済みURLを満たす購入先だけを表示します。優先出品中は先着順、在庫切れ・残高不足・掲載停止時は次順位へ繰り上げます。</p>
  <a class="ghost-button" href="/seller/sp-api">Amazon出品を確認する</a></section>

  <section class="auth-card" id="demand"><p class="eyebrow">DEMAND</p><h2>契約商品で満たせなかった需要</h2>
  <p>個人を特定しないカテゴリ集計です。QA・流入元なし・過去不明の記録を除外し、流入元付きの匿名セッションが5件以上あるカテゴリだけを表示します。セッション件数は人数を意味しません。</p>
  <div class="seller-grid">${demandCards}</div></section>

  <section class="auth-card" id="target-price-demand"><p class="eyebrow">PURCHASE INTENT</p><h2>購入したい価格</h2>
  <p>自社の出品有無を問わず、匿名集計された「この価格なら購入したい」需要を確認できます。会員ID・個別の検索履歴は表示せず、同一商品で5人以上集まった場合だけ公開します。</p>
  <form method="get" action="/seller" class="auth-form"><label><span>商品名・ブランド</span><input name="demand_query" value="${esc(demandQuery)}" maxlength="80" placeholder="例：LILMOON"><small>入力した文字を含む商品名・ブランドの匿名需要に絞り込みます。</small></label><label><span>希望価格（下限）</span><input name="demand_min" type="number" min="0" max="100000000" value="${demandMin||''}"><small>表示したい希望価格帯の最低額です。空欄の場合は下限を指定しません。</small></label><label><span>希望価格（上限）</span><input name="demand_max" type="number" min="0" max="100000000" value="${demandMax===100000000?'':demandMax}"><small>表示したい希望価格帯の最高額です。空欄の場合は上限を指定しません。</small></label><button class="primary-button" type="submit">条件検索</button></form>
  <div class="seller-table-wrap"><table><thead><tr><th>商品</th><th>購入意向</th><th>最低希望額</th><th>平均希望額</th><th>最高希望額</th></tr></thead><tbody>${targetDemandRows}</tbody></table></div></section>

  <section class="auth-card" id="restrictions"><p class="eyebrow">IMPORT KNOWLEDGE</p><h2>輸入制限と国内代替需要</h2>
  <p>輸入制限により契約商品で満たせなかった需要と、国内で購入できる代替商品を確認できた件数を、制限区分ごとにまとめた月次集計です。注文番号や顧客情報は含めず、同一区分の匿名需要が5件以上になった場合だけ表示します。</p><div class="seller-grid">${restrictionCards}</div></section>

  <section class="auth-card" id="integration"><p class="eyebrow">DATA CONNECTION</p><h2>CSV・API連携</h2>
  <div class="seller-grid">
  <article class="seller-panel"><span>CSV</span><strong>一括取込</strong><span>ファイルを使ってASIN・在庫・価格・購入先URL・出品状態をまとめて更新する方式です。このカードは連携方式の説明で、取込完了を示す表示ではありません。</span></article>
  <article class="seller-panel"><span>API</span><strong>自動同期</strong><span>外部システムから商品・在庫・出品停止を継続的に反映する方式です。このカードは利用可能な連携方式の説明で、接続済みを意味しません。</span></article>
  <article class="seller-panel"><span>Amazon SP-API</span><strong>${configuredTenants.length}/${allowed.size} 接続</strong><span>管理対象店舗のうちAmazon商品同期の認可が完了した店舗数です。最新同期: ${syncSummary}。認証情報そのものは表示しません。</span></article>
  </div></section>

  <section class="auth-card" id="marketplaces"><p class="eyebrow">MARKETPLACE URL HEALTH</p>
  <h2>楽天市場・Qoo10・SHEINの商品URL</h2>
  <p>検索結果へ直接購入ボタンを表示できるのは、商品照合済み・販売中・7日以内に確認した商品詳細URLだけです。</p>
  <div class="seller-grid">${marketplaceCards}</div></section>

  <section class="auth-card" id="line"><p class="eyebrow">LINE</p><h2>LINE接続状況</h2>
  <div class="seller-grid">
  <article class="seller-panel"><span>LINEログイン</span><strong>${lineLoginReady ? '設定済み' : '未設定'}</strong><span>ユーザーがLINEアカウントで本人確認・ログインするための認証設定です。</span></article>
  <article class="seller-panel"><span>公式アカウント</span><strong>${lineMessagingReady ? '接続済み' : '未接続'}</strong><span>通知の送信や受信メッセージへの応答に使うWebhookとアクセストークンの接続状態です。</span></article>
  </div></section>

  <section class="auth-card" id="shop"><p class="eyebrow">SHOP PAGE</p><h2>ショップページとクーポン（Business）</h2>
  <p>公開URL <strong id="sellerShopUrl">（未作成）</strong>。検索結果の商品カードに「この商品を扱うショップ」として表示され、会員は「ショップをホシる」でフォローできます。HOSHILU限定クーポンがあると商品カードに 🎟 が付きます。</p>
  <div id="sellerShopStatus" class="operation-status" role="status" aria-live="polite"></div>
  <div class="seller-grid metric-grid">
    <article class="seller-panel"><span>ホシってる人</span><strong data-shop-kpi="followers">…</strong><span>フォロー数</span></article>
    <article class="seller-panel"><span>ショップ閲覧（30日）</span><strong data-shop-kpi="views">…</strong><span>ページ表示回数</span></article>
    <article class="seller-panel"><span>有効クーポン</span><strong data-shop-kpi="coupons">…</strong><span>期間内・公開中</span></article>
  </div>
  <form id="sellerShopForm" class="priority-form">
    <label>ショップ名 <input name="shop_name" maxlength="60" required placeholder="例: with care"></label>
    <label>URL（英数字とハイフン） <input name="slug" maxlength="40" pattern="[a-z0-9-]{3,40}" placeholder="例: with-care"></label>
    <label>ひとこと <input name="tagline" maxlength="80" placeholder="例: 毎日使うものを、少し良く。"></label>
    <label>紹介文 <textarea name="intro" rows="4" maxlength="1500" placeholder="お店の紹介・こだわり・発送や返品のご案内など"></textarea></label>
    <label>ロゴ画像URL（https） <input name="logo_url" type="url" maxlength="500" placeholder="https://…/logo.png"></label>
    <label>公式サイトURL（https） <input name="website_url" type="url" maxlength="500"></label>
    <label><input type="checkbox" name="hidden"> ページを非公開にする</label>
    <button type="submit" class="primary-button">ショップページを保存</button>
  </form>
  <h3>クーポン</h3>
  <div id="sellerCouponList" class="seller-grid"></div>
  <form id="sellerCouponForm" class="priority-form">
    <label>タイトル <input name="title" maxlength="60" required placeholder="例: 初回10%OFF"></label>
    <label>割引の表示 <input name="discount_text" maxlength="40" placeholder="例: 10%OFF ／ 500円引き"></label>
    <label>クーポンコード（任意） <input name="code" maxlength="40" placeholder="例: HOSHILU10"></label>
    <label>対象モール <select name="marketplace"><option value="">共通</option><option value="AMAZON_JP">Amazon</option><option value="RAKUTEN_JP">楽天市場</option><option value="YAHOO_JP">Yahoo!ショッピング</option><option value="QOO10_JP">Qoo10</option><option value="SHEIN_JP">SHEIN</option></select></label>
    <label>クーポンの取得・利用ページURL（https、任意） <input name="landing_url" type="url" maxlength="500"></label>
    <label>終了日（任意） <input name="ends_at" type="date"></label>
    <label>条件（任意） <input name="terms" maxlength="300" placeholder="例: 3,000円以上のご注文"></label>
    <label><input type="checkbox" name="hoshilu_only" checked> HOSHILU限定（商品カードに 🎟 を表示）</label>
    <button type="submit" class="ghost-button">クーポンを追加</button>
  </form>
  <p class="data-note">無料プランではショップページは作れません。<a href="/for-sellers#pricing">Business（月額9,800円・登録後3か月0円）</a></p></section>

  <section class="auth-card" id="billing"><p class="eyebrow">PREPAID BILLING</p><h2>前払い残高とお支払い</h2>
  <p>料金はすべて前払いです。有効クリックはジャンル単価を無料枠→前払い残高の順に消化し、残高が0円になると優先出品は自動で止まります（請求は発生しません）。</p>
  <div id="sellerBillingStatus" class="operation-status" role="status" aria-live="polite"></div>
  <div class="seller-grid metric-grid" id="sellerBillingSummary">
    <article class="seller-panel"><span>利用可能残高</span><strong data-billing="available">…</strong><span data-billing="wallet-note">読み込み中</span></article>
    <article class="seller-panel"><span>今月の無料枠（Business）</span><strong data-billing="allowance">…</strong><span data-billing="allowance-note">Businessは毎月5,000円分まで0円</span></article>
    <article class="seller-panel"><span>月額プラン</span><strong data-billing="plan">…</strong><span data-billing="plan-note"></span></article>
  </div>
  <div class="priority-actions" id="sellerBillingActions">
    <div class="topup-row">
      <label>チャージ額 <select id="sellerTopupAmount">
        <option value="5000">5,000円</option><option value="10000" selected>10,000円</option>
        <option value="30000">30,000円</option><option value="50000">50,000円</option></select></label>
      <button type="button" class="primary-button" data-billing-action="topup">前払いチャージへ進む</button>
    </div>
    <button type="button" class="ghost-button" data-billing-action="subscribe" hidden>Business 月額のお支払い方法を登録</button>
    <button type="button" class="ghost-button" data-billing-action="portal">お支払い方法・領収書・請求書</button>
    <label class="auto-recharge"><input type="checkbox" id="sellerAutoRecharge"> 残高が <span data-billing="threshold">2,000</span>円を下回ったら保存済みカードへ自動チャージ（<span data-billing="auto-amount">10,000</span>円）</label>
  </div>
  <p class="data-note">チャージはカードまたは銀行振込（Stripe が専用の振込先を発行し、入金を自動で照合します）。残高の増減は<a href="/api/seller/billing/ledger">台帳</a>で確認できます。</p></section>

  <section class="auth-card" id="plan"><p class="eyebrow">SELLER PLAN</p><h2>契約プラン</h2>
  <p>現在のプラン: <strong>${publicPlan}</strong>。有料契約によって商品そのものの検索順位は変わりません。</p>
  <div class="seller-grid">
    <article class="seller-panel"><span>無料プラン</span><strong>月額0円</strong><span>自然検索への商品掲載と優先出品の対象指定。有効クリックはジャンル定価を前払い残高から消化します。ショップページはありません。</span></article>
    <article class="seller-panel"><span>Business</span><strong>月額9,800円</strong><span>登録後3か月は月額0円。有効クリックは定価の50%、毎月5,000円分まで0円（1か月目から・4か月目以降も）。1事業者アカウント単位、初期費用・解約金0円。</span></article>
  </div>
  <p class="data-note">自然検索は無料です。優先出品の請求対象は、請求条件を満たしたジャンル別単価の有効クリックだけです。<a href="/for-sellers#pricing">料金を確認</a></p></section>
  </main><script type="module" src="/seller.js"></script></body></html>`;

  return new Response(html, { headers: {
    'content-type': 'text/html; charset=UTF-8',
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    'x-content-type-options': 'nosniff'
  } });
}
