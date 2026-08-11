const grid = document.querySelector('#channelGrid');
const status = document.querySelector('#promotionStatus');
const refresh = document.querySelector('#refreshPromotion');
const logout = document.querySelector('#adminLogout');
const businessGrid = document.querySelector('#businessKpiGrid');
let businessKpis = null; let kpiPeriod = '7d';
const labels = { X: 'X', INSTAGRAM: 'Instagram', TIKTOK: 'TikTok' };
const element = (tag, value = '', className = '') => {
  const node = document.createElement(tag); node.textContent = value; node.className = className; return node;
};
const dateTime = value => value ? new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
}).format(new Date(value)) : '予定なし';

function metric(label, value, tone = '') {
  const node = element('div', '', `promotion-metric ${tone}`.trim());
  node.append(element('span', label), element('strong', String(value)));
  return node;
}
const rate = value => value === null ? '—' : `${value}%`;
function renderBusinessKpis() {
  if (!businessGrid || !businessKpis) return;
  const data = businessKpis.periods[kpiPeriod];
  businessGrid.replaceChildren(
    metric('登録者（累計）', businessKpis.registered_members, 'success'),
    metric('匿名訪問者', data.visitors), metric('訪問セッション', data.sessions),
    metric('流入PV', data.landing_view), metric('検索開始', data.search_started),
    metric('検索完了', data.search_completed), metric('AI結果クリック', data.ai_result_clicked),
    metric('ランキングクリック', data.ranking_result_clicked), metric('価格比較', data.price_comparison_opened),
    metric('モール送客', data.marketplace_click, 'success'), metric('再訪', data.returning_visit),
    metric('訪問→検索', rate(data.rates.visit_to_search)), metric('検索完了率', rate(data.rates.search_completion)),
    metric('結果反応率', rate(data.rates.result_engagement)), metric('比較到達率', rate(data.rates.comparison_reach)),
    metric('送客率', rate(data.rates.marketplace_outbound), 'success')
  );
}
function renderFunnel(channel) {
  const section = element('section', '', 'promotion-funnel');
  section.append(element('h3', '直近7日 購買導線'), element('p', 'SNS流入として記録されたイベント件数（QA除外）', 'funnel-note'));
  const steps = element('div', '', 'funnel-steps');
  steps.append(
    metric('流入', channel.funnel_7d.landing_view), metric('検索開始', channel.funnel_7d.search_started),
    metric('検索完了', channel.funnel_7d.search_completed), metric('AI結果', channel.funnel_7d.ai_result_clicked),
    metric('ランキング', channel.funnel_7d.ranking_result_clicked), metric('価格比較', channel.funnel_7d.price_comparison_opened),
    metric('モール送客', channel.funnel_7d.marketplace_click, 'success'), metric('再訪', channel.funnel_7d.returning_visit)
  );
  const rates = element('div', '', 'funnel-rates');
  rates.append(metric('検索完了率', rate(channel.funnel_rates_7d.search_completion)),
    metric('比較到達率', rate(channel.funnel_rates_7d.comparison_reach)),
    metric('送客率', rate(channel.funnel_rates_7d.marketplace_outbound), 'success'));
  section.append(steps, rates);
  return section;
}

function renderChannel(channel) {
  const card = element('article', '', 'auth-card promotion-channel');
  const head = element('div', '', 'promotion-channel-head');
  const title = element('div');
  title.append(element('p', channel.schedule, 'eyebrow'), element('h2', labels[channel.platform] || channel.platform));
  head.append(title, element('span', channel.configured ? '接続済み' : '未接続',
    `channel-state ${channel.configured ? 'ready' : 'off'}`));
  const next = element('div', '', 'next-post');
  next.append(element('span', '次回予定'), element('strong', dateTime(channel.next?.scheduled_at)),
    element('p', channel.next?.caption || '予約された投稿はありません。'));
  const metrics = element('div', '', 'promotion-metrics');
  metrics.append(
    metric('予約', channel.counts.approved), metric('公開済み', channel.counts.published, 'success'),
    metric('失敗', channel.counts.failed, channel.counts.failed ? 'danger' : '')
  );
  const recent = element('div', '', 'recent-posts');
  recent.append(element('h3', '直近の結果'));
  if (!channel.recent.length) recent.append(element('p', '公開・失敗履歴はありません。', 'empty-row'));
  for (const post of channel.recent) {
    const row = element('div', '', 'recent-post');
    row.append(element('span', post.status === 'PUBLISHED' ? '公開' : '失敗',
      `post-state ${post.status === 'PUBLISHED' ? 'published' : 'failed'}`),
      element('time', dateTime(post.published_at || post.scheduled_at)),
      element('p', post.caption),
      element('small', post.last_error || ''));
    recent.append(row);
  }
  card.append(head, next, metrics, renderFunnel(channel), recent);
  return card;
}

async function load() {
  refresh.disabled = true; status.textContent = '販促状況を確認しています。';
  try {
    const response = await fetch('/api/admin/promotion-dashboard', { cache: 'no-store' });
    if (response.status === 401) return location.replace('/admin-login');
    if (!response.ok) throw new Error('PROMOTION_STATUS_FAILED');
    const payload = await response.json();
    businessKpis = payload.business_kpis; renderBusinessKpis();
    grid.replaceChildren(...payload.channels.map(renderChannel));
    status.textContent = payload.autopilot_enabled
      ? `自動運用中・更新 ${dateTime(payload.generated_at)}` : '自動運用は停止しています。';
  } catch { status.textContent = '販促状況を取得できません。'; }
  finally { refresh.disabled = false; }
}
refresh.addEventListener('click', load);
document.querySelectorAll('[data-kpi-period]').forEach(button => button.addEventListener('click', () => {
  kpiPeriod = button.dataset.kpiPeriod;
  document.querySelectorAll('[data-kpi-period]').forEach(item => item.classList.toggle('active', item === button));
  renderBusinessKpis();
}));
logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    const response = await fetch('/api/admin/logout', { method: 'POST' });
    if (!response.ok) throw new Error('LOGOUT_FAILED');
    location.replace('/admin-login');
  } catch { status.textContent = 'ログアウトできません。'; logout.disabled = false; }
});
load();
