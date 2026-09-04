// 2026-09-04 Creator 別計測URL（発行）と実数KPI（Creator → 施策 → クリエイティブ）。
const status = document.querySelector('#creatorStatus');
const daysSelect = document.querySelector('#creatorDays');
const totals = document.querySelector('#creatorTotals');
const table = document.querySelector('#creatorTable');
const detail = document.querySelector('#creatorDetail');
const detailTitle = document.querySelector('#creatorDetailTitle');
const campaignTable = document.querySelector('#campaignTable');
const creativeTable = document.querySelector('#creativeTable');
const urlForm = document.querySelector('#creatorUrlForm');
const urlResult = document.querySelector('#creatorUrlResult');
const STAGE_LABEL = { landing_view: '着地', search_started: '検索開始', search_completed: '検索完了', marketplace_click: 'モール遷移', wish_saved: 'ホシっとく', returning_visit: '再訪', shop_followed: 'ショップをホシる' };
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
const when = (value) => value ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short' }).format(new Date(value)) : '—';

function renderTable(target, rows, stages, { onSelect = null, keyLabel = 'creator_id' } = {}) {
  target.replaceChildren();
  if (!rows.length) { target.append(el('p', 'まだ計測データがありません。計測URLで着地があると、ここに実数が出ます。', 'empty-row')); return; }
  const t = el('table', undefined, 'data-table'); const head = el('thead'); const hr = el('tr');
  [keyLabel, 'セッション', '訪問者', ...stages.map((s) => STAGE_LABEL[s] || s), '検索率', '遷移率', '初回', '最終'].forEach((h) => hr.append(el('th', h)));
  head.append(hr); t.append(head);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    const keyCell = el('th', row.key || '（未指定）');
    if (onSelect) { keyCell.style.cursor = 'pointer'; keyCell.addEventListener('click', () => onSelect(row.key)); }
    tr.append(keyCell, el('td', String(row.sessions)), el('td', String(row.visitors)));
    for (const s of stages) tr.append(el('td', String(row[s] || 0)));
    tr.append(el('td', `${row.search_rate}%`), el('td', `${row.click_rate}%`), el('td', when(row.first_seen)), el('td', when(row.last_seen)));
    body.append(tr);
  }
  t.append(body); target.append(t);
}

async function load(creatorId = '') {
  status.textContent = '集計しています。';
  try {
    const params = new URLSearchParams({ days: daysSelect.value });
    if (creatorId) params.set('creator_id', creatorId);
    const response = await fetch(`/api/admin/creators/summary?${params}`, { cache: 'no-store' });
    if (response.status === 401) return location.replace('/admin-login');
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'LOAD_FAILED');
    status.textContent = payload.columns_ready ? `直近${payload.days}日・QA除外・${payload.creators.length} Creator` : 'D1 の migration 0070 が未適用です（計測列なし）。';
    totals.replaceChildren();
    const metric = (label, value) => { const box = el('div', undefined, 'promotion-metric'); box.append(el('span', label), el('strong', String(value))); return box; };
    totals.append(metric('セッション', payload.totals.sessions), metric('検索開始', payload.totals.search_started || 0), metric('モール遷移', payload.totals.marketplace_click || 0));
    renderTable(table, payload.creators, payload.stages, { onSelect: (key) => load(key) });
    if (payload.selected_creator) {
      detail.hidden = false;
      detailTitle.textContent = `${payload.selected_creator} の内訳`;
      renderTable(campaignTable, payload.campaigns, payload.stages, { keyLabel: 'campaign_id' });
      renderTable(creativeTable, payload.creatives, payload.stages, { keyLabel: 'creative_id' });
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      detail.hidden = true;
    }
  } catch (error) {
    status.textContent = `読み込めませんでした（${String(error.message || error)}）`;
  }
}

urlForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(urlForm);
  const params = new URLSearchParams();
  for (const name of ['creator_id', 'campaign_id', 'creative_id', 'utm_source', 'path', 'q']) { const value = String(data.get(name) || '').trim(); if (value) params.set(name, value); }
  urlResult.textContent = '作成しています。';
  try {
    const response = await fetch(`/api/admin/creators/url?${params}`, { cache: 'no-store' });
    if (response.status === 401) return location.replace('/admin-login');
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'URL_FAILED');
    urlResult.replaceChildren();
    const code = el('code', payload.url); code.style.overflowWrap = 'anywhere';
    const copy = el('button', 'コピー', 'ghost-button'); copy.type = 'button';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(payload.url); copy.textContent = 'コピーしました'; } catch { copy.textContent = '手動でコピーしてください'; } });
    urlResult.append(code, document.createElement('br'), copy);
  } catch (error) {
    urlResult.textContent = `作成できませんでした（${String(error.message || error)}）`;
  }
});
document.querySelector('#refreshCreators')?.addEventListener('click', () => load());
daysSelect?.addEventListener('change', () => load());
document.querySelector('#adminLogout')?.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
  location.replace('/admin-login');
});
load();
