import { sellerPlanEntitlements } from './seller-pricing-policy.mjs';

function safeText(value) {
  return String(value || '').replace(/[<>&"']/g, '');
}

export async function sellerPageResponse(env = {}, seller = { account: 'Seller', tenants: ['itg'], plan: 'LITE' }) {
  let rows = [];
  let demandRows = [];
  let restrictionRows = [];
  let syncRows = [];
  const entitlements = sellerPlanEntitlements(seller.plan);
  if (env.PRODUCT_DB) {
    try {
      const result = await env.PRODUCT_DB.prepare('SELECT tenant,count(*) AS products FROM products GROUP BY tenant ORDER BY tenant').all();
      const allowed = new Set(seller.tenants || []);
      rows = (result.results || []).filter((row) => allowed.has(String(row.tenant)));
    } catch {}
    try {
      if (!entitlements.advanced_demand_report) throw new Error('PLAN_RESTRICTED');
      const result = await env.PRODUCT_DB.prepare(`SELECT category,
        count(*) AS outbound_count,count(DISTINCT user_hash) AS unique_users,max(occurred_at) AS last_seen_at
        FROM unmet_demand_events WHERE demand_status='UNMET' AND contract_match=0 GROUP BY category
        HAVING count(DISTINCT user_hash)>=5 ORDER BY outbound_count DESC,last_seen_at DESC LIMIT 10`).all();
      demandRows = result.results || [];
    } catch {}
    try {
      if (!entitlements.advanced_demand_report) throw new Error('PLAN_RESTRICTED');
      const result = await env.PRODUCT_DB.prepare(`SELECT tenant,restriction_class,
        sum(anonymous_demand_count) AS demand_count,
        sum(CASE WHEN domestic_alternative_status='VERIFIED' THEN anonymous_demand_count ELSE 0 END) AS covered_count
        FROM import_restriction_knowledge GROUP BY tenant,restriction_class
        HAVING sum(anonymous_demand_count)>=5 ORDER BY demand_count DESC LIMIT 30`).all();
      const allowed = new Set(seller.tenants || []);
      restrictionRows = (result.results || []).filter((row) => allowed.has(String(row.tenant)));
    } catch {}
    try {
      const result = await env.PRODUCT_DB.prepare(`SELECT tenant,result,items,completed_at
        FROM sp_api_sync_audit ORDER BY completed_at DESC LIMIT 100`).all();
      const allowed = new Set(seller.tenants || []);
      const seen = new Set();
      syncRows = (result.results || []).filter((row) => {
        const tenant = String(row.tenant);
        if (!allowed.has(tenant) || seen.has(tenant)) return false;
        seen.add(tenant);
        return true;
      });
    } catch {}
  }
  const total = rows.reduce((sum, row) => sum + Number(row.products || 0), 0);
  const tenantSummary = rows.length
    ? rows.map((row) => `${safeText(row.tenant)}: ${Number(row.products).toLocaleString('ja-JP')}`).join(' / ')
    : (seller.tenants || []).map(safeText).join(' / ') || '未設定';
  const demandTotal = demandRows.reduce((sum, row) => sum + Number(row.outbound_count || 0), 0);
  const demandMap = demandRows.length
    ? demandRows.map((row) => `<article class="seller-panel"><span>${safeText(row.category || '未分類')}</span>
      <strong>${Number(row.outbound_count || 0).toLocaleString('ja-JP')}</strong>
      <span>Amazonへの送客 / 匿名需要 ${Number(row.unique_users || 0).toLocaleString('ja-JP')}人</span></article>`).join('')
    : entitlements.advanced_demand_report
      ? '<article class="seller-panel"><span>プライバシー保護中</span><strong>集計待ち</strong><span>匿名ユーザー5人以上の需要だけを表示します</span></article>'
      : '<article class="seller-panel"><span>契約機能</span><strong>詳細分析</strong><span>カテゴリ別トレジャーMAPはGROWTH以上で利用できます</span></article>';
  const lineLoginReady = Boolean(env.LINE_LOGIN_CHANNEL_ID && env.LINE_LOGIN_CHANNEL_SECRET);
  const lineMessagingReady = Boolean(env.LINE_CHANNEL_SECRET && env.LINE_CHANNEL_ACCESS_TOKEN);
  const spApiConfigured = (seller.tenants || []).filter((tenant) => Boolean(
    env[`SPAPI_REFRESH_TOKEN_${String(tenant).toUpperCase()}`]
  )).length;
  const spApiSummary = syncRows.length
    ? syncRows.map((row) => `${safeText(row.tenant)} ${safeText(row.result)} ${Number(row.items || 0).toLocaleString('ja-JP')}件`).join(' / ')
    : '同期実績待ち';
  const html = `<!doctype html><html lang="ja"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#7357ff"><meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="/icons/icon.svg"><link rel="stylesheet" href="/auth.css">
  <style>.seller-shell .auth-card{margin-bottom:18px;scroll-margin-top:24px}.seller-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:22px}.seller-actions a{display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none}@media(max-width:700px){.seller-actions{grid-template-columns:1fr 1fr}.seller-actions a:last-child{grid-column:1/-1}}</style>
  <title>メーカー＆セラー管理 | HOSHILU</title></head><body>
  <header class="auth-top"><a class="auth-brand" href="/"><img src="/icons/icon.svg" width="42" height="42" alt=""><span>HOSHILU FOR BUSINESS</span></a>
  <div class="auth-actions"><select class="auth-language" data-language-select aria-label="Language">
  <option value="JA">日本語</option><option value="EN">English</option><option value="ZH">中文</option><option value="KO">한국어</option>
  </select><button id="sellerLogout" class="ghost-button" type="button">ログアウト</button></div></header>
  <main class="seller-shell">
  <section class="auth-card"><p class="eyebrow">MAKER &amp; SELLER CONSOLE</p><h1>${safeText(seller.account)} 管理画面</h1>
  <p>契約プラン: <strong>${safeText(seller.plan)}</strong> / 対象: ${tenantSummary}</p>
  <nav class="seller-actions" aria-label="管理メニュー"><a class="primary-button" href="#catalog">商品管理</a>
  <a class="primary-button" href="#offers">購入先管理</a><a class="primary-button" href="#demand">需要を見る</a>
  <a class="primary-button" href="#integration">CSV・API連携</a><a class="primary-button" href="#plan">契約プラン</a></nav></section>
  <section class="seller-grid"><article class="seller-panel"><span>対象アカウント</span><strong>${rows.length}</strong><span>${tenantSummary}</span></article>
  <article class="seller-panel"><span>登録商品データ</span><strong>${total.toLocaleString('ja-JP')}</strong><span>検索対象の商品数</span></article>
  <article class="seller-panel"><span>未充足Amazon送客</span><strong>${demandTotal.toLocaleString('ja-JP')}</strong><span>契約商品で満たせなかった需要</span></article></section>
  <section class="auth-card" id="catalog"><p class="eyebrow">CATALOG</p><h2>商品管理</h2><p>契約アカウントに紐づく商品の登録件数です。追加・更新はCSVまたはAPI連携から行います。</p>
  <div class="seller-grid">${rows.length ? rows.map((row) => `<article class="seller-panel"><span>${safeText(row.tenant)}</span><strong>${Number(row.products || 0).toLocaleString('ja-JP')}</strong><span>登録商品</span></article>`).join('') : '<article class="seller-panel"><span>商品</span><strong>0</strong><span>未登録</span></article>'}</div></section>
  <section class="auth-card" id="offers"><p class="eyebrow">OFFERS</p><h2>購入先管理</h2>
  <p>同じASINを複数社が登録した場合は、PARTNER → PRO → GROWTH → LITEの順で購入先を決定します。同じプランでは先に有効登録した購入先を優先し、在庫切れ・出品停止時は次の有効な購入先へ自動で切り替えます。</p>
  <a class="ghost-button" href="#integration">商品情報を連携する</a></section>
  <section class="auth-card" id="demand"><p class="eyebrow">TREASURE MAP</p><h2>契約商品で満たせなかった需要</h2>
  <p>${entitlements.advanced_demand_report ? '個人を特定しないカテゴリ集計です。匿名ユーザー5人以上の需要だけを表示します。' : '契約プランで許可された分析項目だけを表示します。'}</p><div class="seller-grid">${demandMap}</div></section>
  <section class="auth-card" id="restrictions"><p class="eyebrow">IMPORT KNOWLEDGE</p><h2>輸入制限と国内代替の充足状況</h2>
  <p>注文番号や顧客情報を含まない月次集計です。5件未満の分類は表示しません。</p><div class="seller-grid">${
    entitlements.advanced_demand_report && restrictionRows.length
      ? restrictionRows.map((row) => `<article class="seller-panel"><span>${safeText(row.restriction_class)}</span>
      <strong>${Number(row.demand_count || 0).toLocaleString('ja-JP')}</strong>
      <span>国内代替確認済み ${Number(row.covered_count || 0).toLocaleString('ja-JP')}件</span></article>`).join('')
      : entitlements.advanced_demand_report
        ? '<article class="seller-panel"><span>プライバシー保護中</span><strong>集計待ち</strong><span>同じ分類が5件以上になると表示します</span></article>'
        : '<article class="seller-panel"><span>契約機能</span><strong>詳細分析</strong><span>GROWTH以上で利用できます</span></article>'
  }</div></section>
  <section class="auth-card" id="integration"><p class="eyebrow">DATA CONNECTION</p><h2>CSV・API連携</h2><div class="seller-grid">
  <article class="seller-panel"><span>CSV</span><strong>一括取込</strong><span>ASIN・在庫・購入先URL・出品状態を更新</span></article>
  <article class="seller-panel"><span>API</span><strong>自動同期</strong><span>商品・在庫・出品停止を継続同期</span></article>
  <article class="seller-panel"><span>Amazon SP-API</span><strong>${spApiConfigured}/${(seller.tenants || []).length} 接続</strong><span>${spApiSummary}。認証情報は表示しません</span></article></div></section>
  <section class="auth-card" id="line"><p class="eyebrow">LINE</p><h2>LINE接続状況</h2><div class="seller-grid">
  <article class="seller-panel"><span>LINEログイン</span><strong>${lineLoginReady ? '設定済み' : '未設定'}</strong><span>ユーザー認証</span></article>
  <article class="seller-panel"><span>公式アカウント</span><strong>${lineMessagingReady ? '接続済み' : '未接続'}</strong><span>通知・応答 Webhook: /webhook</span></article></div>
  ${lineMessagingReady ? '' : '<p>通知・自動応答には、Messaging APIのチャネルシークレットとチャネルアクセストークンの登録が必要です。</p>'}</section>
  <section class="auth-card" id="plan"><p class="eyebrow">SELLER PLAN</p><h2>契約プラン</h2>
  <p>有料契約によって商品そのものの検索順位は変わりません。プラン差は同一ASINの送客先優先順位と、利用できる分析・連携機能にのみ適用します。</p></section>
  </main><script src="/site-i18n.js"></script><script type="module" src="/seller.js"></script></body></html>`;
  return new Response(html, { headers: {
    'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin'
  } });
}
