const headers = {
  'content-type': 'text/html; charset=UTF-8', 'cache-control': 'no-store',
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer', 'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'content-security-policy': "default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; script-src 'self'; style-src 'self'"
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
  <nav class="admin-nav"><a href="/admin/promotion">販促一覧</a><a class="active" href="/admin/sp-api">認証監査</a></nav>
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
  <link rel="stylesheet" href="/admin-promotion.css"><title>経営KPI | HOSHILU</title></head><body>
  <main class="admin-shell promotion-shell"><section class="auth-card"><div class="admin-head"><div>
  <p class="eyebrow">BUSINESS KPI</p><h1>HOSHILU 経営ダッシュボード</h1></div>
  <button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a class="active" href="/admin/promotion">経営KPI</a><a href="/admin/reels">AIリール管理</a><a href="/admin/sp-api">認証監査</a></nav>
  <div class="dashboard-actions"><p id="promotionStatus" role="status"></p>
  <button id="refreshPromotion" class="ghost-button" type="button">最新状態に更新</button></div></section>
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
  <section class="dashboard-split">
  <article class="auth-card"><div class="section-head"><div><p class="eyebrow">ACQUISITION QUALITY</p><h2>流入元別の成果</h2></div></div><div id="sourceTable" class="data-table-wrap" aria-live="polite"></div></article>
  <article class="auth-card"><div class="section-head"><div><p class="eyebrow">COMMERCE</p><h2>モール送客</h2></div></div><div id="marketplaceTable" class="data-table-wrap" aria-live="polite"></div></article>
  </section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">SUPPORTING METRICS</p><h2>詳細KPI</h2></div></div>
  <div id="businessKpiGrid" class="business-kpi-grid" aria-live="polite"></div></section>
  <div class="section-head social-section-head"><div><p class="eyebrow">SOCIAL OPERATIONS</p><h2>SNS投稿運用</h2></div></div>
  <section id="channelGrid" class="promotion-channel-grid" aria-live="polite"></section>
  </main><script type="module" src="/admin-promotion.js"></script></body></html>`, { headers });
}

export function adminReelsPageResponse() {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/admin-sp-api.css">
  <link rel="stylesheet" href="/admin-promotion.css"><title>AIリール管理 | HOSHILU</title></head><body>
  <main class="admin-shell promotion-shell"><section class="auth-card"><div class="admin-head"><div>
  <p class="eyebrow">AI REELS</p><h1>AIリール管理</h1></div><button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a href="/admin/promotion">経営KPI</a><a class="active" href="/admin/reels">AIリール管理</a><a href="/admin/sp-api">認証監査</a></nav>
  <p>自動投稿を基本とし、確認が必要な動画だけここで公開できます。</p>
  <div class="dashboard-actions"><p id="reelStatus" role="status"></p><button id="refreshReels" class="ghost-button" type="button">最新状態に更新</button></div></section>
  <section class="auth-card"><div class="section-head"><div><p class="eyebrow">PENDING &amp; HISTORY</p><h2>動画一覧</h2></div></div>
  <div id="reelGrid" class="promotion-channel-grid" aria-live="polite"></div></section>
  </main><script type="module" src="/admin-reels.js"></script></body></html>`, { headers });
}
