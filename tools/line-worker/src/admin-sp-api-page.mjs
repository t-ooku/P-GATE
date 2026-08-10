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
  <form id="adminLoginForm"><label>管理ID<input name="id" autocomplete="username" required maxlength="100"></label>
  <label>パスワード<input name="password" type="password" autocomplete="current-password" required minlength="16" maxlength="200"></label>
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
  <link rel="stylesheet" href="/admin-promotion.css"><title>販促運用 | HOSHILU</title></head><body>
  <main class="admin-shell promotion-shell"><section class="auth-card"><div class="admin-head"><div>
  <p class="eyebrow">PROMOTION OPERATIONS</p><h1>販促運用ダッシュボード</h1></div>
  <button id="adminLogout" class="ghost-button" type="button">ログアウト</button></div>
  <nav class="admin-nav"><a class="active" href="/admin/promotion">販促一覧</a><a href="/admin/sp-api">認証監査</a></nav>
  <div class="dashboard-actions"><p id="promotionStatus" role="status"></p>
  <button id="refreshPromotion" class="ghost-button" type="button">最新状態に更新</button></div></section>
  <section id="channelGrid" class="promotion-channel-grid" aria-live="polite"></section>
  </main><script type="module" src="/admin-promotion.js"></script></body></html>`, { headers });
}
