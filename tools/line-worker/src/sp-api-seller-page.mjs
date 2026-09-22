const esc = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function spApiSellerPageResponse(seller = { account: 'Seller', tenants: [] }) {
  const tenants = (seller.tenants || []).map((tenant) => String(tenant)).join(',');
  const html = `<!doctype html><html lang="ja"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#7357ff">
  <link rel="icon" href="/icons/icon.svg"><link rel="stylesheet" href="/auth.css">
  <style>
  .sync-shell{width:min(1080px,calc(100% - 28px));margin:28px auto 64px}
  .sync-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  .sync-card{background:#fff;border:1px solid #ddd7ff;border-radius:18px;padding:20px;box-shadow:0 10px 30px #3c267012}
  .sync-card h2{margin:6px 0}.sync-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}
  .sync-meta div{background:#f7f5ff;border-radius:12px;padding:10px}.sync-meta span{display:block;color:#665f78;font-size:.8rem}
  .sync-actions{display:flex;gap:8px;flex-wrap:wrap}.sync-status{min-height:1.5em;margin-top:10px}
  .connection-ready{color:#087a45}.connection-waiting{color:#a34a00}
  @media(max-width:760px){.sync-grid{grid-template-columns:1fr}}
  </style><title>Amazon SP-API同期 | HOSHILU</title></head><body>
  <header class="auth-top"><a class="auth-brand" href="/seller"><img src="/icons/icon.svg" width="42" height="42" alt=""><span>HOSHILU FOR BUSINESS</span></a>
  <div class="auth-actions"><a class="ghost-button" href="/seller">管理画面へ戻る</a><button id="sellerLogout" class="ghost-button" type="button">ログアウト</button></div></header>
  <main class="sync-shell" data-tenants="${esc(tenants)}">
  <section class="auth-card"><p class="eyebrow">AMAZON SP-API</p><h1>Amazon商品同期</h1>
  <p>${esc(seller.account)} の許可された店舗だけを表示します。認証情報の値は画面やログへ表示しません。</p>
  <button id="refreshSpApiStatus" class="ghost-button" type="button">接続状態を更新</button>
  <p id="spApiPageStatus" class="sync-status" role="status"></p></section>
  <section id="spApiStoreGrid" class="sync-grid" aria-live="polite"></section>
  <noscript>この画面の同期操作にはJavaScriptが必要です。</noscript>
  </main><script type="module" src="/seller-sp-api.js"></script></body></html>`;
  return new Response(html, { headers: {
    'content-type': 'text/html; charset=UTF-8',
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    'x-content-type-options': 'nosniff'
  } });
}
