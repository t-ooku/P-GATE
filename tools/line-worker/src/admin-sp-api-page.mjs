const headers = {
  'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store',
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer', 'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'content-security-policy': "default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; media-src 'self'; script-src 'self'; style-src 'self'"
};
export function adminLoginPageResponse() {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/auth.css"><title>運用管理ログイン | HOSHILU</title></head><body>
  <main class="auth-shell"><section class="auth-card"><p class="eyebrow">OPERATOR ONLY</p>
  <h1>運用管理ログイン</h1><p>ログインから30分後に再認証します。</p>
  <form id="adminLoginForm"><label>メールアドレス<input id="adminId" name="id" type="email" autocomplete="username" required maxlength="100"></label>
  <label>パスワード（8文字以上）<input id="adminPassword" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="200"></label>
  <button class="primary-button" type="submit">ログイン</button><p id="adminLoginStatus" role="status"></p></form>
  </section></main><script type="module" src="/admin-login.js"></script></body></html>`, { headers });
}
export function adminSpApiPageResponse() {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/admin-sp-api.css">
  <title>認証監査 | HOSHILU</title></head><body><main class="admin-shell">
  <section class="auth-card"><div class="admin-head"><div><p class="eyebrow">SECURITY</p><h1>認証監査</h1></div>
  <button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a href="/admin/promotion">販促一覧</a><a href="/admin/seller-candidates">Seller候補</a><a href="/admin/creators">Creator計測</a><a class="active" href="/admin/sp-api">認証監査</a></nav>
  <button id="refreshAdminStatus" class="ghost-button" type="button">状態を更新</button>
  <p id="adminPageStatus" role="status"></p></section>
  <section class="auth-card"><h2>管理ログイン監査（24時間）</h2><p id="adminAuthSummaryStatus"></p>
  <div id="adminAuthSummaryGrid" class="auth-summary-grid"></div></section>
  <section class="auth-card"><h2>セラーログイン監査（24時間）</h2><p id="sellerAuthSummaryStatus"></p>
  <div id="sellerAuthSummaryGrid" class="auth-summary-grid"></div></section>
  </main><script type="module" src="/admin-sp-api.js"></script></body></html>`, { headers });
}

export function adminPromotionPageResponse() {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/admin-sp-api.css">
  <link rel="stylesheet" href="/admin-promotion.css?v=2"><title>経営KPI | HOSHILU</title></head><body>
  <main class="admin-shell promotion-shell"><section class="auth-card"><div class="admin-head"><div>
  <p class="eyebrow">BUSINESS KPI</p><h1>HOSHILU 経営ダッシュボード</h1></div>
  <button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a class="active" href="/admin/promotion">経営KPI</a><a href="/admin/reels">AIリール管理</a><a href="/admin/seller-billing">セラー請求</a><a href="/admin/seller-candidates">Seller候補</a><a href="/admin/creators">Creator計測</a><a href="/admin/sp-api">認証監査</a></nav>
  <div class="dashboard-actions"><p id="promotionStatus" role="status"></p>
  <button id="refreshPromotion" class="ghost-button" type="button">最新状態に更新</button>
  <button id="runSearchQaCanary" class="ghost-button" type="button">検索品質カナリアを今すぐ実行</button></div>
  <pre id="searchQaCanaryResult" class="search-qa-canary-result" hidden></pre></section>
  <!-- 2026-09-17 第2指示書 §18: 4 つのタブ（経営KPI／検索品質／SHOP・Seller／流入・販促） -->
  <nav class="kpi-tabs" role="tablist" aria-label="KPIの区分"><button type="button" role="tab" data-kpi-tab="business" class="active" aria-selected="true">経営KPI</button><button type="button" role="tab" data-kpi-tab="search" aria-selected="false">検索品質</button><button type="button" role="tab" data-kpi-tab="shop" aria-selected="false">SHOP・Seller</button><button type="button" role="tab" data-kpi-tab="acquisition" aria-selected="false">流入・販促</button></nav>
  <div class="kpi-tab-panel" data-kpi-panel="business">
  <section class="auth-card kpi-overview"><div class="kpi-period-head"><div><p class="eyebrow">NORTH STAR &amp; GROWTH</p><h2>事業の現在地</h2></div>
  <div class="kpi-period-switch" role="group" aria-label="集計期間"><button type="button" data-kpi-period="7d" class="active">7日</button><button type="button" data-kpi-period="30d">30日</button></div></div>
  <p class="funnel-note">QAを除外し、ブラウザ生成の匿名IDで重複を除外。個人情報・検索文は保存しません。</p>
  <div id="northStarGrid" class="north-star-grid" aria-live="polite"></div>
  <div id="kpiUnavailable" class="kpi-unavailable" hidden></div></section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">DECISION SUPPORT</p><h2>今やること</h2></div><span class="section-note">直前の同期間と比較</span></div>
  <div id="insightGrid" class="insight-grid" aria-live="polite"></div></section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">VALUE FUNNEL</p><h2>価値到達ファネル</h2></div><span class="section-note">ユニークセッション</span></div>
  <div id="valueFunnel" class="value-funnel" aria-live="polite"></div></section>
  <section class="dashboard-split">
  <article class="auth-card"><div class="section-head"><div><p class="eyebrow">TREND</p><h2>日別推移</h2></div></div><div id="trendChart" class="trend-chart" aria-live="polite"></div></article>
  <article class="auth-card"><div class="section-head"><div><p class="eyebrow">DATA TRUST</p><h2>計測品質</h2></div></div><div id="qualityGrid" class="quality-grid" aria-live="polite"></div></article>
  </section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">SUPPORTING METRICS</p><h2>詳細KPI</h2></div></div>
  <div id="businessKpiGrid" class="business-kpi-grid" aria-live="polite"></div></section>
  </div>
  <div class="kpi-tab-panel" data-kpi-panel="search" hidden>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">SEARCH QUALITY</p><h2>検索品質</h2></div><span class="section-note">回数（QA除外・検索文なし）</span><div class="kpi-period-switch" role="group" aria-label="集計期間"><button type="button" data-kpi-period="7d" class="active">7日</button><button type="button" data-kpi-period="30d">30日</button></div></div>
  <p class="funnel-note">「違う率」は結果カードの「これです／違う」の押下だけが分母です。検索の失敗＝失敗イベント＋行き止まり。</p>
  <div id="searchQualityGrid" class="business-kpi-grid" aria-live="polite"></div></section>
  </div>
  <div class="kpi-tab-panel" data-kpi-panel="shop" hidden>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">SHOP SEARCH &amp; DEMAND</p><h2>SHOP・Seller</h2></div><span class="section-note">回数と件数だけ。推定売上・CVは出しません</span><div class="kpi-period-switch" role="group" aria-label="集計期間"><button type="button" data-kpi-period="7d" class="active">7日</button><button type="button" data-kpi-period="30d">30日</button></div></div>
  <p class="funnel-note">横断検索の区分（一致／近い／見つからない）→ ホシっとく（需要保存）→ Seller の商品登録で HOSHILU が一致と判定した回数。需要の内容（検索文）は表示しません。</p>
  <div id="shopSellerGrid" class="business-kpi-grid" aria-live="polite"></div>
  <div class="section-head"><div><p class="eyebrow">NOW</p><h3>いまの在庫的な数字</h3></div></div>
  <div id="shopStockGrid" class="business-kpi-grid" aria-live="polite"></div></section>
  </div>
  <div class="kpi-tab-panel" data-kpi-panel="acquisition" hidden>
  <section class="dashboard-split">
  <article class="auth-card"><div class="section-head"><div><p class="eyebrow">ACQUISITION QUALITY</p><h2>流入元別の成果</h2></div></div>
  <p class="funnel-note">「直接・不明」には UTM の無い着地が入ります。2026-09-17 までは検索エンジン・SNS からの参照元（referrer）を読んでいなかったため、それ以前の期間は直接・不明が実態より多く出ます。</p>
  <div id="sourceTable" class="data-table-wrap" aria-live="polite"></div></article>
  <article class="auth-card"><div class="section-head"><div><p class="eyebrow">COMMERCE</p><h2>モール送客</h2></div></div><div id="marketplaceTable" class="data-table-wrap" aria-live="polite"></div></article>
  </section>
  <div class="section-head social-section-head"><div><p class="eyebrow">SOCIAL OPERATIONS</p><h2>SNS投稿運用</h2></div></div>
  <section id="channelGrid" class="promotion-channel-grid" aria-live="polite"></section>
  </div>
  </main><script type="module" src="/admin-promotion.js?v=3"></script></body></html>`, { headers });
}

export function adminReelsPageResponse() {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/admin-sp-api.css">
  <link rel="stylesheet" href="/admin-promotion.css"><title>AIリール管理 | HOSHILU</title></head><body>
  <main class="admin-shell promotion-shell"><section class="auth-card"><div class="admin-head"><div>
  <p class="eyebrow">AI REELS</p><h1>AIリール管理</h1></div><button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a href="/admin/promotion">経営KPI</a><a class="active" href="/admin/reels">AIリール管理</a><a href="/admin/seller-billing">セラー請求</a><a href="/admin/seller-candidates">Seller候補</a><a href="/admin/creators">Creator計測</a><a href="/admin/sp-api">認証監査</a></nav>
  <p>自動投稿を基本とし、確認が必要な動画だけここで公開できます。</p>
  <div class="dashboard-actions"><p id="reelStatus" role="status"></p><button id="refreshReels" class="ghost-button" type="button">最新状態に更新</button></div></section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">PENDING &amp; HISTORY</p><h2>動画一覧</h2></div></div>
  <div id="reelGrid" class="promotion-channel-grid" aria-live="polite"></div></section>
  </main><script type="module" src="/admin-reels.js"></script></body></html>`, { headers });
}

// 2026-09-04 請求・決済（前払い・Stripe）: 管理者がセラーの請求アカウントを登録し、
// 月額登録・チャージ用の Stripe リンクを受け取る。セラー画面のログインが無くても
// ここからリンクを渡せば決済まで通る。
export function adminSellerBillingPageResponse() {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/admin-sp-api.css">
  <link rel="stylesheet" href="/admin-promotion.css"><title>セラー請求 | HOSHILU</title></head><body>
  <main class="admin-shell promotion-shell"><section class="auth-card"><div class="admin-head"><div>
  <p class="eyebrow">SELLER BILLING</p><h1>セラー請求（前払い）</h1></div><button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a href="/admin/promotion">経営KPI</a><a href="/admin/reels">AIリール管理</a><a class="active" href="/admin/seller-billing">セラー請求</a><a href="/admin/seller-candidates">Seller候補</a><a href="/admin/creators">Creator計測</a><a href="/admin/sp-api">認証監査</a></nav>
  <p>新規Sellerは初回公開から30日無料・本人申込みで月額4,980円（税込）へ移行。手動掲載の管理画面で条件を確認してください。この旧契約管理欄は既存契約用です。クリック課金はすべて停止（旧ジャンル課金・Demand Match Click 50円とも 2026-09-21 に廃止）。Demand Match のクリックは課金せず件数だけ記録する。</p>
  <div class="dashboard-actions"><p id="billingStatus" role="status"></p><button id="refreshBilling" class="ghost-button" type="button">最新状態に更新</button></div></section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">REGISTER</p><h2>請求アカウントを登録</h2></div></div>
  <form id="billingForm" class="auth-form">
    <label>事業者名 <input name="account_name" required maxlength="100" placeholder="例: ITG GROUP"></label>
    <label>担当者メール <input name="contact_email" type="email" required placeholder="seller@example.com"></label>
    <label>プラン <select name="plan"><option value="BUSINESS">既存契約管理（¥4,980/月・合意済み条件を維持）</option><option value="SELLER">旧契約管理（新規募集対象外）</option></select></label>
    <label>支払い方法 <select name="payment_preference"><option value="CARD">カード（自動引落・自動チャージ可）</option><option value="BANK_TRANSFER">銀行振込（Stripe が専用口座を発行）</option></select></label>
    <label>テナント（カンマ区切り） <input name="tenants" placeholder="itg,itt,mc2"></label>
    <label>優先出品のセラーID（1行に「テナント,セラーID」） <textarea name="seller_ids" rows="3" placeholder="itg,A1SELLER"></textarea></label>
    <label>セラー画面の識別子 seller_key（任意・既存セラーを紐付ける場合だけ） <input name="seller_key" pattern="[A-Za-z0-9_-]{20,120}" placeholder="空欄なら自動発行"></label>
    <button class="primary-button" type="submit">登録して Stripe リンクを作る</button>
  </form>
  <div id="billingResult" class="operation-status" aria-live="polite"></div></section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">ACCOUNTS</p><h2>登録済みアカウント</h2></div></div>
  <div id="billingAccounts" class="data-table-wrap" aria-live="polite"></div></section>
  </main><script type="module" src="/admin-seller-billing.js"></script></body></html>`, { headers });
}


// 2026-09-21 指示書 §35・§36「Seller営業を需要起点に」「Seller候補管理」。
// 未充足の需要 → 候補 → 営業済 → 返信 → 無料登録 → 商品連携 → DMC発生 → 有料化。
// 数字は /api/admin/seller-candidates の実データだけ。件数はここに焼き込まない。
// 行は消さない（降りた相手は「見送り」にして履歴を残す）。
export function adminSellerCandidatesPageResponse() {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/admin-sp-api.css">
  <link rel="stylesheet" href="/admin-promotion.css"><title>Seller候補 | HOSHILU</title></head><body>
  <main class="admin-shell promotion-shell"><section class="auth-card"><div class="admin-head"><div>
  <p class="eyebrow">SELLER PIPELINE</p><h1>Seller候補管理</h1></div><button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a href="/admin/promotion">経営KPI</a><a href="/admin/reels">AIリール管理</a><a href="/admin/seller-billing">セラー請求</a><a class="active" href="/admin/seller-candidates">Seller候補</a><a href="/admin/creators">Creator計測</a><a href="/admin/sp-api">認証監査</a></nav>
  <p>未充足の需要から、その需要に応えられそうなセラーを追います。入れるのは公開されている事業者向けの情報だけです（ショップ名・公開連絡先・商品URL）。ユーザーの個人情報は入れません。</p>
  <div class="dashboard-actions"><p id="candidateStatus" role="status"></p>
  <button id="refreshCandidates" class="ghost-button" type="button">最新状態に更新</button></div></section>

  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">DEMAND</p><h2>いま応え手がいない需要</h2></div></div>
  <p class="metric-help">匿名集計で5人以上集まった探し中需要です。ここから候補を足せます。</p>
  <div id="candidateDemands" class="data-table-wrap" aria-live="polite"></div></section>

  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">ADD</p><h2>候補を足す</h2></div></div>
  <form id="candidateForm" class="auth-form">
    <label>ショップ名 <input name="shop_name" required minlength="2" maxlength="120" placeholder="例: かばんやさん"></label>
    <label>どの需要に対する候補か（任意） <input name="demand_label" maxlength="160" placeholder="例: 黒 本革 A4トート"></label>
    <input type="hidden" name="demand_key">
    <input type="hidden" name="demand_people" value="0">
    <label>公開されている問い合わせ先URL（任意・https のみ） <input name="contact_url" type="url" placeholder="https://example.com/contact"></label>
    <label>出典URL（任意・https のみ） <input name="source_url" type="url" placeholder="https://example.com/company"></label>
    <label>商品URL（任意・https のみ） <input name="product_url" type="url" placeholder="https://www.amazon.co.jp/dp/..."></label>
    <label>メモ（任意） <textarea name="note" rows="2" maxlength="400"></textarea></label>
    <button class="primary-button" type="submit">候補に足す</button>
  </form>
  <div id="candidateResult" class="operation-status" aria-live="polite"></div></section>

  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">PIPELINE</p><h2>候補と進み具合</h2></div></div>
  <div id="candidateCounts" class="business-kpi-grid" aria-live="polite"></div>
  <div id="candidateRows" class="data-table-wrap" aria-live="polite"></div>
  <p class="metric-help">候補は消しません。降りた相手は「見送り」にして履歴を残します。</p></section>
  </main><script type="module" src="/admin-seller-candidates.js"></script></body></html>`, { headers });
}


// 2026-09-04 総合実行指示書 §66–70: Creator 別計測URL の発行と実数KPI。
export function adminCreatorsPageResponse() {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/admin-sp-api.css">
  <link rel="stylesheet" href="/admin-promotion.css"><title>Creator計測 | HOSHILU</title></head><body>
  <main class="admin-shell promotion-shell"><section class="auth-card"><div class="admin-head"><div>
  <p class="eyebrow">CREATOR TRACKING</p><h1>Creator 別計測URLと実数KPI</h1></div><button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a href="/admin/promotion">経営KPI</a><a href="/admin/reels">AIリール管理</a><a href="/admin/seller-billing">セラー請求</a><a href="/admin/seller-candidates">Seller候補</a><a class="active" href="/admin/creators">Creator計測</a><a href="/admin/sp-api">認証監査</a></nav>
  <p>インフルエンサーごとに URL を発行し、着地した訪問者のイベント（検索・モール遷移・ホシっとく・再訪）を Creator → 施策 → クリエイティブで数えます。QA は除外、すべて実数。</p>
  <div class="dashboard-actions"><label>期間 <select id="creatorDays"><option value="7">7日</option><option value="30" selected>30日</option><option value="90">90日</option></select></label><p id="creatorStatus" role="status"></p><button id="refreshCreators" class="ghost-button" type="button">最新状態に更新</button></div></section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">URL BUILDER</p><h2>計測URLを発行</h2></div></div>
  <form id="creatorUrlForm" class="auth-form">
    <label>creator_id（英数字・_・-、例: toridori_ai_001） <input name="creator_id" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" placeholder="creator_001"></label>
    <label>campaign_id（任意、例: sep_launch） <input name="campaign_id" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}"></label>
    <label>creative_id（任意、例: reel_a） <input name="creative_id" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}"></label>
    <label>掲載先（utm_source、任意） <select name="utm_source"><option value="">指定しない</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="x">X</option><option value="youtube">YouTube</option><option value="threads">Threads</option></select></label>
    <label>着地先 <select name="path"><option value="/">トップ（横断検索）</option><option value="/shop/with-care">ショップ with care</option><option value="/buzz.html">BUZZ</option></select></label>
    <label>検索語を入れておく（任意） <input name="q" maxlength="80" placeholder="例: 自立するトートバッグ"></label>
    <button class="primary-button" type="submit">URLを作る</button>
  </form>
  <div id="creatorUrlResult" class="operation-status" aria-live="polite"></div></section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">CREATORS</p><h2>Creator 別（クリックで施策・クリエイティブ内訳）</h2></div></div>
  <div id="creatorTotals" class="promotion-metrics"></div>
  <div id="creatorTable" class="data-table-wrap" aria-live="polite"></div></section>
  <section class="auth-card" id="creatorDetail" hidden><div class="section-head"><div><p class="eyebrow">BREAKDOWN</p><h2 id="creatorDetailTitle">内訳</h2></div></div>
  <h3>施策（campaign_id）</h3><div id="campaignTable" class="data-table-wrap"></div>
  <h3>クリエイティブ（creative_id）</h3><div id="creativeTable" class="data-table-wrap"></div></section>
  </main><script type="module" src="/admin-creators.js"></script></body></html>`, { headers });
}
