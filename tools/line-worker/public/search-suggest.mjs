// 2026-09-05 大隆さん指示: Amazonのように、検索中に想定ワード・関連ワード候補を並べる。
// さらに「詳細検索」を投稿URLボタンの右へ移し、押したら Amazon やメルカリのように多種多様な条件
// （価格帯・ブランド/メーカー・状態・配送）を選べるようにする。ブランドは入力ワードから特定した
// ジャンルの辞書（search-suggest-data.mjs）から出す。
//
// 設計: #query が唯一の状態（app.js の方針）。候補も条件チップも #query の文字列に足す/外すだけで、
// 検索本体(/api/knowledge)の契約は変えない。通信なし・保存なし（履歴は app.js の端末内履歴を読むだけ）。
import { suggestQueries, detectSuggestionCategory, PRICE_BUCKETS, CONDITION_CHIPS } from './search-suggest-data.mjs';

const $ = (selector) => document.querySelector(selector);
const HISTORY_KEY = 'hoshilu_member_search_history';
const copy = {
  JA: { history: '履歴', related: '関連', brand: 'メーカー', brandGroup: 'ブランド・メーカー', price: '価格帯', hint: '候補をタップすると、その条件ですぐ検索します' },
  EN: { history: 'History', related: 'Related', brand: 'Brand', brandGroup: 'Brands & makers', price: 'Price range', hint: 'Tap a suggestion to search with it right away' },
  ZH: { history: '历史', related: '相关', brand: '品牌', brandGroup: '品牌・厂商', price: '价格区间', hint: '点按候选词立即搜索' },
  KO: { history: '기록', related: '관련', brand: '브랜드', brandGroup: '브랜드·제조사', price: '가격대', hint: '후보를 누르면 바로 검색합니다' }
};
const language = () => $('#languageSelect')?.value || 'JA';
const t = () => copy[language()] || copy.JA;

function readHistory(query) {
  try {
    const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const lower = String(query || '').normalize('NFKC').trim().toLowerCase();
    return (Array.isArray(rows) ? rows : [])
      .map((row) => (typeof row === 'string' ? row : row?.query || row?.text || ''))
      .filter((text) => text && text.toLowerCase().includes(lower) && text.toLowerCase() !== lower)
      .slice(0, 3)
      .map((text) => ({ query: text, kind: 'history' }));
  } catch { return []; }
}

// ---------- 入力中の候補（ドロップダウン） ----------
function runSearchWith(query) {
  const field = $('#query');
  const form = $('#knowledgeForm');
  if (!field || !form) return;
  field.value = query;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  hideSuggestions();
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { cancelable: true }));
}

let list = null;
let activeIndex = -1;
let suppressSuggest = false;
function ensureList() {
  if (list) return list;
  const anchor = $('.query-field');
  if (!anchor) return null;
  list = document.createElement('ul');
  list.id = 'searchSuggestList';
  list.className = 'search-suggest-list hidden';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t().hint);
  anchor.insertAdjacentElement('afterend', list);
  return list;
}
function hideSuggestions() { if (list) { list.classList.add('hidden'); list.replaceChildren(); activeIndex = -1; } }

// 実データ（在庫の商品名・教師データ）から来る候補。辞書に無いジャンルでも
// 「セカンドワード」が出るようにするため。取れなければ黙って辞書だけで動く。
const dataSuggestions = new Map(); // 入力語 -> [{query, kind}]
let dataInFlight = '';
function fetchDataSuggestions(text) {
  if (!text || dataSuggestions.has(text) || dataInFlight === text) return;
  dataInFlight = text;
  fetch(`/api/search/suggest?q=${encodeURIComponent(text)}&language=${encodeURIComponent(language())}`, { headers: { accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => {
      const rows = Array.isArray(body?.suggestions) ? body.suggestions : [];
      dataSuggestions.set(text, rows.filter((row) => row && typeof row.query === 'string').slice(0, 4));
      if (String($('#query')?.value || '').trim() === text) renderSuggestions(text);
    })
    .catch(() => { dataSuggestions.set(text, []); })
    .finally(() => { if (dataInFlight === text) dataInFlight = ''; });
}

function renderSuggestions(query) {
  const target = ensureList();
  if (!target) return;
  const text = String(query || '').trim();
  if (text.length < 1) { hideSuggestions(); return; }
  fetchDataSuggestions(text);
  // 並び: 履歴 → 辞書（関連ワード・メーカー）→ 在庫と教師データから出た語。
  // 辞書の枠を実データで潰さないよう、それぞれ上限を持たせてから10件に切る。
  const merged = [];
  const seen = new Set([text.toLowerCase()]);
  for (const group of [readHistory(text).slice(0, 2), suggestQueries(text, { limit: 7 }), (dataSuggestions.get(text) || []).slice(0, 4)]) {
    for (const item of group) {
      const value = String(item?.query || '').trim();
      if (!value || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      merged.push({ query: value, kind: item.kind || 'related' });
    }
  }
  const items = merged.slice(0, 10);
  if (!items.length) { hideSuggestions(); return; }
  const labels = t();
  const lower = text.toLowerCase();
  target.replaceChildren(...items.map((item, index) => {
    const li = document.createElement('li');
    li.className = `search-suggest-item search-suggest-${item.kind}`;
    li.setAttribute('role', 'option');
    li.dataset.index = String(index);
    const icon = document.createElement('span');
    icon.className = 'search-suggest-icon';
    icon.textContent = item.kind === 'history' ? '⟲' : item.kind === 'brand' ? '◆' : '⌕';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'search-suggest-text';
    const value = item.query;
    const head = value.toLowerCase().startsWith(lower) ? value.slice(0, text.length) : '';
    const tail = head ? value.slice(text.length) : value;
    label.append(head, Object.assign(document.createElement('b'), { textContent: tail }));
    const kind = document.createElement('span');
    kind.className = 'search-suggest-kind';
    kind.textContent = labels[item.kind] || '';
    li.append(icon, label, kind);
    li.addEventListener('mousedown', (event) => { event.preventDefault(); runSearchWith(value); });
    return li;
  }));
  target.classList.remove('hidden');
  activeIndex = -1;
}

function moveActive(delta) {
  if (!list || list.classList.contains('hidden')) return false;
  const items = [...list.children];
  if (!items.length) return false;
  activeIndex = (activeIndex + delta + items.length) % items.length;
  items.forEach((node, index) => node.classList.toggle('is-active', index === activeIndex));
  return true;
}

function bindQuery() {
  const field = $('#query');
  if (!field) return;
  let timer = 0;
  field.addEventListener('input', () => {
    window.clearTimeout(timer);
    if (suppressSuggest) { suppressSuggest = false; hideSuggestions(); refreshBrandRow(); return; }
    timer = window.setTimeout(() => { renderSuggestions(field.value); refreshBrandRow(); }, 120);
  });
  field.addEventListener('focus', () => { if (field.value.trim()) renderSuggestions(field.value); });
  field.addEventListener('blur', () => window.setTimeout(hideSuggestions, 150));
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { hideSuggestions(); return; }
    if (event.key === 'ArrowDown' && moveActive(1)) { event.preventDefault(); return; }
    if (event.key === 'ArrowUp' && moveActive(-1)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && activeIndex >= 0 && list && !list.classList.contains('hidden')) {
      event.preventDefault();
      const node = list.children[activeIndex];
      const value = node?.querySelector('.search-suggest-text')?.textContent || '';
      if (value) runSearchWith(value);
    }
  });
  $('#knowledgeForm')?.addEventListener('submit', hideSuggestions);
}

// ---------- 詳細検索の追加条件（価格帯・ブランド・状態・配送） ----------
function queryHas(term) {
  const text = String($('#query')?.value || '').normalize('NFKC').toLowerCase();
  return text.includes(String(term).normalize('NFKC').toLowerCase());
}
function toggleQueryTerm(term, { exclusive = [] } = {}) {
  const field = $('#query');
  if (!field) return;
  const target = String(term).normalize('NFKC');
  const tokens = String(field.value || '').normalize('NFKC').split(/\s+/u).filter(Boolean);
  const had = tokens.some((token) => token.toLowerCase() === target.toLowerCase());
  const drop = new Set([target, ...exclusive].map((value) => String(value).normalize('NFKC').toLowerCase()));
  const kept = tokens.filter((token) => !drop.has(token.toLowerCase()));
  if (!had) kept.push(target);
  field.value = kept.join(' ');
  // 条件チップからの変更ではドロップダウン候補を出さない(パネル操作の邪魔になる)
  suppressSuggest = true;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  suppressSuggest = false;
  syncPressed();
}

function chipRow(label, values, { exclusive = false, className = '' } = {}) {
  const row = document.createElement('div');
  row.className = `condition-group condition-group-extra ${className}`.trim();
  row.append(Object.assign(document.createElement('span'), { className: 'condition-group-label', textContent: label }));
  const wrap = document.createElement('div');
  wrap.className = 'condition-value-list';
  const terms = values.map((item) => (typeof item === 'string' ? { label: item, text: item } : item));
  for (const item of terms) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'keyword-tag condition-chip condition-chip-extra';
    chip.dataset.term = item.text;
    chip.textContent = item.label;
    chip.setAttribute('aria-pressed', String(queryHas(item.text)));
    chip.addEventListener('click', () => toggleQueryTerm(item.text, { exclusive: exclusive ? terms.map((entry) => entry.text) : [] }));
    wrap.append(chip);
  }
  row.append(wrap);
  return row;
}
function syncPressed() {
  let any = false;
  document.querySelectorAll('.condition-chip-extra').forEach((chip) => {
    const on = queryHas(chip.dataset.term || '');
    any = any || on;
    chip.setAttribute('aria-pressed', String(on));
    chip.classList.toggle('selected', on);
  });
  // 追加条件だけ選んだ場合も「この条件で探す」を押せるようにする(#query は既に更新済み)。
  const submit = $('#advancedSearchPanel .condition-search-submit');
  if (submit && any) submit.disabled = false;
}

function brandRow() {
  const category = detectSuggestionCategory($('#query')?.value || '');
  if (!category) return null;
  return chipRow(t().brandGroup, category.brands, { className: 'condition-group-brand' });
}
function refreshBrandRow() {
  const card = $('#advancedSearchPanel .condition-search-card');
  if (!card) return;
  const existing = card.querySelector('.condition-group-brand');
  const fresh = brandRow();
  if (existing && fresh) existing.replaceWith(fresh);
  else if (existing && !fresh) existing.remove();
  else if (!existing && fresh) card.querySelector('.condition-group-price')?.insertAdjacentElement('afterend', fresh);
  syncPressed();
}

function augmentConditionCard(card) {
  if (!card || card.dataset.extraConditions === '1') return;
  card.dataset.extraConditions = '1';
  const labels = t();
  const rows = [chipRow(labels.price, PRICE_BUCKETS, { exclusive: true, className: 'condition-group-price' })];
  const brand = brandRow();
  if (brand) rows.push(brand);
  for (const group of CONDITION_CHIPS) rows.push(chipRow(group.group, group.values, { exclusive: group.group === '状態' }));
  // 既存の見出し文(タイトル+説明)の直後、サーバ側チップ(種類・色・サイズ…)より前に置く。
  const anchor = card.querySelector('.condition-search-body') || card.firstElementChild;
  let cursor = anchor;
  for (const row of rows) { cursor.insertAdjacentElement('afterend', row); cursor = row; }
  syncPressed();
}

function watchConditionPanel() {
  const panel = $('#advancedSearchPanel');
  if (!panel) return;
  const observer = new MutationObserver(() => {
    const card = panel.querySelector('.condition-search-card');
    if (card) augmentConditionCard(card);
  });
  observer.observe(panel, { childList: true });
  const card = panel.querySelector('.condition-search-card');
  if (card) augmentConditionCard(card);
}

bindQuery();
watchConditionPanel();
window.HoshiluSearchSuggest = { suggestQueries, detectSuggestionCategory, render: renderSuggestions };
