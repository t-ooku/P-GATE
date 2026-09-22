const pageStatus = document.querySelector('#adminPageStatus');
const refresh = document.querySelector('#refreshAdminStatus');
const logout = document.querySelector('#adminLogout');
const views = [
  ['adminAuthSummaryGrid', 'adminAuthSummaryStatus', 'admin_auth_summary', '管理ログイン'],
  ['sellerAuthSummaryGrid', 'sellerAuthSummaryStatus', 'seller_auth_summary', 'セラーログイン']
];
const labels = { LOGIN_SUCCESS: 'ログイン成功', LOGIN_FAILURE: 'ログイン失敗', LOGIN_LOCKED: '試行停止', LOGOUT: 'ログアウト' };
const element = (tag, value, className = '') => {
  const node = document.createElement(tag); node.textContent = value; node.className = className; return node;
};
function render(gridId, statusId, items = [], subject) {
  const grid = document.querySelector(`#${gridId}`);
  const status = document.querySelector(`#${statusId}`);
  const byType = new Map(items.map((item) => [item.event_type, item]));
  grid.replaceChildren(...Object.entries(labels).map(([type, label]) => {
    const panel = element('div', '', 'auth-summary-item');
    panel.append(element('span', label), element('strong', String(Number(byType.get(type)?.total || 0))));
    return panel;
  }));
  const locked = Number(byType.get('LOGIN_LOCKED')?.total || 0);
  status.textContent = locked ? `${subject}の試行停止が${locked}件あります。` : '試行停止はありません。';
}
async function load() {
  refresh.disabled = true; pageStatus.textContent = '認証監査を確認しています。';
  try {
    const response = await fetch('/api/internal/sp-api/status', { cache: 'no-store' });
    if (response.status === 401) return location.replace('/admin-login');
    if (!response.ok) throw new Error('STATUS_FAILED');
    const payload = await response.json();
    for (const [grid, status, key, subject] of views) render(grid, status, payload[key], subject);
    pageStatus.textContent = '認証監査を更新しました。';
  } catch { pageStatus.textContent = '認証監査を取得できません。'; }
  finally { refresh.disabled = false; }
}
refresh.addEventListener('click', load);
logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    const response = await fetch('/api/admin/logout', { method: 'POST' });
    if (!response.ok) throw new Error('LOGOUT_FAILED');
    location.replace('/admin-login');
  } catch { pageStatus.textContent = 'ログアウトできません。'; logout.disabled = false; }
});
load();
