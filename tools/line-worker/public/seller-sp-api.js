const pageStatus = document.querySelector('#spApiPageStatus');
const grid = document.querySelector('#spApiStoreGrid');
const refresh = document.querySelector('#refreshSpApiStatus');
const logout = document.querySelector('#sellerLogout');

const text = (tag, value, className = '') => {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
};

const dateLabel = (value) => {
  if (!value) return '未同期';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP') : '未同期';
};

const errorLabel = (error) => ({
  SP_API_TENANT_NOT_CONFIGURED: 'Amazon認証情報が未登録です',
  TENANT_NOT_ALLOWED: 'この店舗を操作する権限がありません',
  UNAUTHORIZED: 'セッションの有効期限が切れました'
})[error] || `同期に失敗しました: ${error || 'UNKNOWN'}`;

function storeCard(store) {
  const card = document.createElement('article');
  card.className = 'sync-card';
  card.append(text('p', store.tenant.toUpperCase(), 'eyebrow'));
  card.append(text('h2', store.store_name));
  card.append(text('p', store.configured ? '接続済み' : '認証情報待ち',
    store.configured ? 'connection-ready' : 'connection-waiting'));
  const meta = document.createElement('div');
  meta.className = 'sync-meta';
  for (const [label, value] of [
    ['同期済み', Number(store.total || 0).toLocaleString('ja-JP')],
    ['公開可能', Number(store.active || 0).toLocaleString('ja-JP')],
    ['最終確認', dateLabel(store.last_observed_at)],
    ['最終結果', store.last_sync?.result || '未同期']
  ]) {
    const item = document.createElement('div');
    item.append(text('span', label), text('strong', value));
    meta.append(item);
  }
  card.append(meta);
  const actions = document.createElement('div');
  actions.className = 'sync-actions';
  const sync = text('button', '全件同期を実行');
  sync.type = 'button';
  sync.className = 'primary-button';
  sync.disabled = !store.configured;
  const status = text('p', '', 'sync-status');
  sync.addEventListener('click', async () => {
    if (!confirm(`${store.store_name} のAmazon出品を全件同期しますか？`)) return;
    sync.disabled = true;
    status.textContent = '同期を実行しています。画面を閉じずにお待ちください。';
    try {
      const response = await fetch('/api/seller/sp-api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant: store.tenant, full: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
      status.textContent = `${payload.items || 0}件、${payload.pages || 0}ページを同期しました。`;
      await loadStatus();
    } catch (error) {
      status.textContent = errorLabel(error.message);
      sync.disabled = !store.configured;
    }
  });
  actions.append(sync);
  card.append(actions, status);
  return card;
}

async function loadStatus() {
  pageStatus.textContent = '接続状態を確認しています。';
  try {
    const response = await fetch('/api/seller/sp-api/status', { cache: 'no-store' });
    if (response.status === 401) {
      location.replace('/seller-login.html');
      return;
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
    grid.replaceChildren(...payload.stores.map(storeCard));
    pageStatus.textContent = payload.stores.some((store) => !store.configured)
      ? 'Amazon認証情報が未登録の店舗があります。'
      : 'すべての店舗が接続済みです。';
  } catch (error) {
    pageStatus.textContent = errorLabel(error.message);
  }
}

refresh.addEventListener('click', loadStatus);
logout.addEventListener('click', async () => {
  await fetch('/api/seller/logout', { method: 'POST' });
  location.replace('/');
});
loadStatus();
