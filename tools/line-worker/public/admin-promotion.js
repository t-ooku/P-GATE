const grid = document.querySelector('#channelGrid');
const status = document.querySelector('#promotionStatus');
const refresh = document.querySelector('#refreshPromotion');
const logout = document.querySelector('#adminLogout');
const businessGrid = document.querySelector('#businessKpiGrid');
const northStarGrid = document.querySelector('#northStarGrid');
const unavailable = document.querySelector('#kpiUnavailable');
const insightGrid = document.querySelector('#insightGrid');
const valueFunnel = document.querySelector('#valueFunnel');
const trendChart = document.querySelector('#trendChart');
const qualityGrid = document.querySelector('#qualityGrid');
const sourceTable = document.querySelector('#sourceTable');
const marketplaceTable = document.querySelector('#marketplaceTable');
let businessKpis = null;
let kpiPeriod = '7d';

const labels = { X: 'X', INSTAGRAM: 'Instagram', TIKTOK: 'TikTok' };
const marketplaceLabels = {
  AMAZON_JP: 'Amazon', RAKUTEN_JP: '楽天市場', YAHOO_JP: 'Yahoo!ショッピング',
  QOO10_JP: 'Qoo10', SHEIN_JP: 'SHEIN', ZOZOTOWN_JP: 'ZOZOTOWN',
  SHOPLIST_JP: 'SHOPLIST', MUSINSA_JP: 'MUSINSA', BUYMA_JP: 'BUYMA',
  SNKRDUNK_JP: 'スニーカーダンク', LOFT_JP: 'ロフト', HANDS_JP: 'ハンズ',
  MATSUKIYO_JP: 'マツキヨ', COSME_JP: '@cosme', ABCMART_JP: 'ABC-MART'
};
const sourceLabels = {
  direct: '直接・不明', instagram: 'Instagram', x: 'X', tiktok: 'TikTok',
  google: 'Google', yahoo: 'Yahoo!', bing: 'Bing', line: 'LINE'
};
const searchInputLabels = {
  TEXT: '一言', SCREENSHOT: 'スクショ', SOCIAL_URL: '投稿URL',
  TEXT_SCREENSHOT: '一言＋スクショ', TEXT_SOCIAL_URL: '一言＋投稿URL',
  SCREENSHOT_SOCIAL_URL: 'スクショ＋投稿URL',
  TEXT_SCREENSHOT_SOCIAL_URL: '一言＋スクショ＋投稿URL'
};
const element = (tag, value = '', className = '') => {
  const node = document.createElement(tag);
  node.textContent = value;
  node.className = className;
  return node;
};
const dateTime = value => value ? new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
}).format(new Date(value)) : 'データなし';
const dayLabel = value => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(new Date(`${value}T00:00:00Z`));
const rate = value => value === null || value === undefined ? '—' : `${value}%`;
const seconds = value => value === null || value === undefined ? '—' : value < 60 ? `${Math.round(value)}秒` : `${Math.round(value / 6) / 10}分`;
const formatNumber = value => new Intl.NumberFormat('ja-JP').format(Number(value || 0));

function metric(label, value, tone = '', note = '') {
  const node = element('div', '', `promotion-metric ${tone}`.trim());
  node.append(element('span', label), element('strong', String(value)));
  if (note) node.append(element('small', note));
  return node;
}

function deltaText(value, unit = '%') {
  if (value === null || value === undefined) return '直前期間：比較不可';
  if (value === 0) return '直前期間と同じ';
  return `直前期間より${value > 0 ? '+' : ''}${value}${unit}`;
}

function northStarCard(label, value, delta, tone, definition) {
  const card = element('article', '', `north-star-card ${tone}`.trim());
  card.append(element('p', label, 'north-star-label'), element('strong', value, 'north-star-value'),
    element('span', delta, 'north-star-delta'), element('small', definition, 'north-star-definition'));
  return card;
}

function renderNorthStar(data) {
  const current = data.current;
  const compared = data.comparison;
  northStarGrid.replaceChildren(
    northStarCard('North Star｜商品発見', formatNumber(current.value_sessions),
      deltaText(compared.counts.value_sessions), 'primary', '検索成功後に価値ある行動へ進んだセッション'),
    northStarCard('価値到達率', rate(current.rates.value_realization),
      deltaText(compared.rates.value_realization, 'pt'), 'success', '商品発見 ÷ 検索成功'),
    northStarCard('モール送客', formatNumber(current.outbound_sessions),
      deltaText(compared.counts.outbound_sessions), 'commerce', '検索成功後にモールへ進んだセッション'),
    northStarCard('登録者（累計）', formatNumber(businessKpis.registered_members),
      '本人確認済み通知先で重複除外', 'member', 'LINE・メールの登録者数')
  );
}

function renderInsights(data) {
  const cards = data.insights.map(item => {
    const card = element('article', '', `insight-card ${item.tone}`);
    card.append(element('strong', item.title), element('p', item.detail));
    return card;
  });
  insightGrid.replaceChildren(...cards);
}

function renderFunnel(data) {
  const current = data.current;
  const stages = [
    ['訪問', current.landing_sessions, null],
    ['検索開始', current.search_sessions, current.rates.visit_to_search],
    ['検索成功', current.completed_search_sessions, current.rates.search_completion],
    ['商品発見', current.value_sessions, current.rates.value_realization],
    ['モール送客', current.outbound_sessions,
      current.value_sessions > 0 ? Math.round(current.outbound_sessions / current.value_sessions * 1000) / 10 : null]
  ];
  const maximum = Math.max(1, ...stages.map(([, value]) => value));
  const rows = stages.map(([label, value, conversion], index) => {
    const row = element('div', '', 'funnel-row');
    const heading = element('div', '', 'funnel-row-head');
    heading.append(element('strong', label), element('span', formatNumber(value)));
    const track = element('div', '', 'funnel-track');
    const fill = element('div', '', `funnel-fill stage-${index + 1}`);
    fill.style.width = `${Math.max(value ? 4 : 0, value / maximum * 100)}%`;
    track.append(fill);
    row.append(heading, track, element('small', conversion === null ? '起点' : `前段階から ${rate(conversion)}`));
    return row;
  });
  valueFunnel.replaceChildren(...rows);
}

function renderTrend(data) {
  const active = data.daily.filter(day => day.visitors || day.search_sessions || day.value_sessions || day.outbound_sessions);
  if (!active.length) {
    trendChart.replaceChildren(element('p', '日別データはまだありません。', 'empty-row'));
    return;
  }
  const maximum = Math.max(1, ...active.map(day => Math.max(day.search_sessions, day.value_sessions, day.outbound_sessions)));
  const legend = element('div', '', 'chart-legend');
  for (const [name, className] of [['検索', 'search'], ['商品発見', 'value'], ['送客', 'outbound']]) {
    const item = element('span', name);
    item.dataset.series = className;
    legend.append(item);
  }
  const chart = element('div', '', 'bar-chart');
  for (const day of active) {
    const column = element('div', '', 'bar-column');
    const bars = element('div', '', 'bar-group');
    for (const [key, className] of [['search_sessions', 'search'], ['value_sessions', 'value'], ['outbound_sessions', 'outbound']]) {
      const bar = element('span', '', `chart-bar ${className}`);
      bar.style.height = `${Math.max(day[key] ? 5 : 0, day[key] / maximum * 100)}%`;
      bar.title = `${dayLabel(day.day)} ${day[key]}件`;
      bars.append(bar);
    }
    column.append(bars, element('small', dayLabel(day.day)));
    chart.append(column);
  }
  trendChart.replaceChildren(legend, chart);
}

function renderQuality(data) {
  const current = data.current;
  const coverageTone = (current.rates.tracking_coverage ?? 0) >= 90 ? 'success' : 'danger';
  qualityGrid.replaceChildren(
    metric('匿名ID付与率', rate(current.rates.tracking_coverage), coverageTone, '率分析の信頼性'),
    metric('計測イベント', formatNumber(current.events), '', 'QAを除外'),
    metric('流入判別率', rate(current.rates.attributed_sessions), '', 'UTM等で判別できたセッション'),
    metric('検索失敗率', rate(current.rates.search_failure), current.failed_search_sessions ? 'danger' : '', '失敗 ÷ 検索開始'),
    metric('平均検索時間', seconds(current.avg_search_seconds), '', '開始から成功まで'),
    metric('最終計測', dateTime(current.last_event_at), '', '本番イベントの鮮度')
  );
}

function table(headers, rows) {
  const tableNode = element('table', '', 'data-table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  headers.forEach(label => headRow.append(element('th', label)));
  head.append(headRow);
  const body = document.createElement('tbody');
  rows.forEach(values => {
    const row = document.createElement('tr');
    values.forEach((value, index) => row.append(element(index ? 'td' : 'th', value)));
    body.append(row);
  });
  tableNode.append(head, body);
  return tableNode;
}

function renderSources(data) {
  if (!data.sources.length) {
    sourceTable.replaceChildren(element('p', '流入元データはまだありません。', 'empty-row'));
    return;
  }
  sourceTable.replaceChildren(table(['流入元', '検索', '商品発見', '価値率', '送客'], data.sources.map(row => [
    sourceLabels[row.source] || row.source, formatNumber(row.search_sessions), formatNumber(row.value_sessions),
    rate(row.value_rate), formatNumber(row.outbound_sessions)
  ])));
}

function renderMarketplaces(data) {
  if (!data.marketplaces.length) {
    marketplaceTable.replaceChildren(element('p', 'モール送客はまだありません。', 'empty-row'));
    return;
  }
  const total = data.marketplaces.reduce((sum, row) => sum + row.outbound_sessions, 0);
  marketplaceTable.replaceChildren(table(['モール', '送客', '構成比'], data.marketplaces.map(row => [
    marketplaceLabels[row.marketplace] || row.marketplace, formatNumber(row.outbound_sessions),
    rate(total ? Math.round(row.outbound_sessions / total * 1000) / 10 : null)
  ])));
}

function renderDetailKpis(data) {
  const current = data.current;
  const mix = data.search_input_mix || { total_searches: 0, counts: {}, rates: {}, performance: {} };
  const mixNote = Object.keys(searchInputLabels).map(type => {
    const row = mix.performance[type] || {};
    return `${searchInputLabels[type]} 受理${formatNumber(row.attempts)}・成功${formatNumber(row.completed)}（${rate(row.success_rate)}）・送客${formatNumber(row.outbound)}（CVR ${rate(row.outbound_rate)}）`;
  }).join(' / ');
  businessGrid.replaceChildren(
    metric('匿名訪問者', formatNumber(current.visitors)), metric('訪問セッション', formatNumber(current.sessions)),
    metric('再訪ユーザー率', rate(current.rates.repeat_visitor)), metric('検索開始率', rate(current.rates.visit_to_search)),
    metric('検索成功率', rate(current.rates.search_completion)), metric('価格比較到達率', rate(current.rates.comparison_reach)),
    metric('モール送客率', rate(current.rates.marketplace_outbound), 'success'),
    metric('無料会員登録率', rate(current.rates.registration), '',
      `${formatNumber(current.registration_sessions)}登録 ÷ 着地セッション`),
    metric('お気に入り', formatNumber(current.wish_sessions)), metric('共有開始', formatNumber(current.share_sessions)),
    metric('平均価値到達時間', seconds(current.avg_value_seconds)),
    metric('受理検索の入力構成', `${formatNumber(mix.total_searches)}件`, '',
      `${mixNote}｜${mix.rate_definition || '割合は受理検索に占める構成比'}`)
  );
}

function renderBusinessKpis() {
  if (!businessKpis) return;
  if (businessKpis.status !== 'READY') {
    unavailable.hidden = false;
    unavailable.textContent = 'KPIデータを取得できません。計測DBの移行状態を確認してください。SNS運用データは下に表示します。';
    northStarGrid.replaceChildren(); insightGrid.replaceChildren(); valueFunnel.replaceChildren();
    trendChart.replaceChildren(); qualityGrid.replaceChildren(); sourceTable.replaceChildren(); marketplaceTable.replaceChildren(); businessGrid.replaceChildren();
    return;
  }
  unavailable.hidden = true;
  const data = businessKpis.periods[kpiPeriod];
  renderNorthStar(data); renderInsights(data); renderFunnel(data); renderTrend(data); renderQuality(data);
  renderSources(data); renderMarketplaces(data); renderDetailKpis(data);
}

function renderSocialFunnel(channel) {
  const section = element('section', '', 'promotion-funnel');
  section.append(element('h3', '直近7日 購買導線'), element('p', 'SNS流入のイベント件数（QA除外）', 'funnel-note'));
  const steps = element('div', '', 'funnel-steps');
  steps.append(metric('流入', channel.funnel_7d.landing_view), metric('検索開始', channel.funnel_7d.search_started),
    metric('検索成功', channel.funnel_7d.search_completed), metric('商品反応', channel.funnel_7d.ai_result_clicked + channel.funnel_7d.ranking_result_clicked),
    metric('価格比較', channel.funnel_7d.price_comparison_opened), metric('モール送客', channel.funnel_7d.marketplace_click, 'success'));
  const rates = element('div', '', 'funnel-rates');
  rates.append(metric('検索成功率', rate(channel.funnel_rates_7d.search_completion)),
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
  head.append(title, element('span', channel.configured ? '接続済み' : '未接続', `channel-state ${channel.configured ? 'ready' : 'off'}`));
  const next = element('div', '', 'next-post');
  next.append(element('span', '次回予定'), element('strong', dateTime(channel.next?.scheduled_at)),
    element('p', channel.next?.caption || '予約された投稿はありません。'));
  const metrics = element('div', '', 'promotion-metrics');
  metrics.append(metric('予約', channel.counts.approved), metric('公開済み', channel.counts.published, 'success'),
    metric('失敗', channel.counts.failed, channel.counts.failed ? 'danger' : ''));
  const recent = element('div', '', 'recent-posts');
  recent.append(element('h3', '直近の結果'));
  if (!channel.recent.length) recent.append(element('p', '公開・失敗履歴はありません。', 'empty-row'));
  for (const post of channel.recent) {
    const row = element('div', '', 'recent-post');
    row.append(element('span', post.status === 'PUBLISHED' ? '公開' : '失敗', `post-state ${post.status === 'PUBLISHED' ? 'published' : 'failed'}`),
      element('time', dateTime(post.published_at || post.scheduled_at)), element('p', post.caption), element('small', post.last_error || ''));
    recent.append(row);
  }
  card.append(head, next, metrics, renderSocialFunnel(channel), recent);
  return card;
}

async function load() {
  refresh.disabled = true;
  status.textContent = '経営KPIを確認しています。';
  try {
    const response = await fetch('/api/admin/promotion-dashboard', { cache: 'no-store' });
    if (response.status === 401) return location.replace('/admin-login');
    if (!response.ok) throw new Error('PROMOTION_STATUS_FAILED');
    const payload = await response.json();
    businessKpis = payload.business_kpis;
    renderBusinessKpis();
    grid.replaceChildren(...(payload.channels || []).map(renderChannel));
    const warning = payload.social_warnings?.length ? '・SNSデータの一部を取得できません' : '';
    status.textContent = `更新 ${dateTime(payload.generated_at)}${warning}`;
  } catch {
    status.textContent = '経営KPIを取得できません。再読み込みしてください。';
  } finally {
    refresh.disabled = false;
  }
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
  } catch {
    status.textContent = 'ログアウトできません。';
    logout.disabled = false;
  }
});
load();
