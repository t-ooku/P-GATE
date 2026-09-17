// 2026-09-17 大隆さん「HOSHILU SHOP全面強化」指示書 P0: 全ショップ横断検索。
// 「ショップ」タブの最上部に総合検索窓。結果は 条件一致 / 近い商品 / 見つからない の3段階で、
// 近い商品には何が一致して何が違うかを出す（一致率の推測値は出さない）。
// 見つからなければ「ホシっとく」で探し中需要として預かり、商品が入ったら本人に知らせる。
const section = document.querySelector('#shopSearch');
const form = document.querySelector('#shopSearchForm');
const input = document.querySelector('#shopSearchInput');
const results = document.querySelector('#shopSearchResults');
const popular = document.querySelector('#shopSearchPopular');
const filtersBox = document.querySelector('#shopSearchFilters');
const DEMAND_KEY = 'hoshilu_shop_demands';

const text = (value) => String(value ?? '');
function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function yen(value) { return `¥${Number(value).toLocaleString('ja-JP')}`; }
function readDemands() { try { const list = JSON.parse(localStorage.getItem(DEMAND_KEY) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } }
function writeDemands(list) { try { localStorage.setItem(DEMAND_KEY, JSON.stringify(list.slice(-20))); } catch {} }

function candidateFor(card) {
  return {
    record_key: text(card.record_key), display_name: text(card.name), product_name: text(card.name), image_url: text(card.image),
    marketplace: text(card.marketplace || 'AMAZON_JP'), product_url: text(card.url),
    offers: [{ marketplace: text(card.marketplace || 'AMAZON_JP'), product_url: text(card.url), price: Number(card.price) || 0, total_cost: Number(card.price) || 0 }]
  };
}

function conditionChips(labels, className) {
  const wrap = el('div', 'shop-search-conditions');
  for (const label of labels) wrap.append(el('span', `shop-search-condition ${className}`, label));
  return wrap;
}

function card(item) {
  const article = el('article', `shop-search-card shop-search-card-${item.level.toLowerCase()}`);
  const media = el('a', 'shop-search-card-media');
  media.href = text(item.url); media.target = '_blank'; media.rel = 'noopener sponsored';
  if (item.image) {
    const img = document.createElement('img');
    img.src = window.HoshiluImage?.upgrade(text(item.image), 300) || text(item.image); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    media.append(img);
  }
  const body = el('div', 'shop-search-card-body');
  const name = el('a', 'shop-search-card-name', text(item.name));
  name.href = text(item.url); name.target = '_blank'; name.rel = 'noopener sponsored';
  body.append(name);
  if (Number(item.price) > 0) body.append(el('p', 'shop-search-card-price', yen(item.price)));
  if (item.shop?.name) {
    const shop = el('a', 'shop-search-card-shop');
    shop.href = `/shop/${encodeURIComponent(text(item.shop.slug))}`;
    shop.append(el('span', 'shop-search-card-shop-icon', String.fromCodePoint(0x1F3EA)), document.createTextNode(text(item.shop.name)));
    if (item.shop.coupon) shop.append(el('em', 'shop-search-card-coupon', 'HOSHILU限定クーポン'));
    body.append(shop);
  }
  const conditions = el('div', 'shop-search-card-conditions');
  for (const label of item.matched || []) conditions.append(el('span', 'shop-search-condition matched', `✓ ${label}`));
  for (const label of item.unmatched || []) conditions.append(el('span', 'shop-search-condition unmatched', `△ ${label}ではない`));
  if (conditions.childElementCount) body.append(conditions);
  const actions = el('div', 'shop-search-card-actions');
  const open = el('a', 'shop-search-card-open', 'ショップで見る');
  open.href = `/shop/${encodeURIComponent(text(item.shop?.slug || ''))}?q=${encodeURIComponent(text(item.name).slice(0, 60))}`;
  actions.append(open);
  const keep = el('button', 'shop-search-card-keep');
  keep.type = 'button';
  const paint = () => { const kept = Boolean(window.HoshiluKeep?.isKept(candidateFor(item))); keep.textContent = kept ? '♥ 気になる' : '♡ 気になる'; keep.classList.toggle('kept', kept); };
  keep.addEventListener('click', () => { window.HoshiluKeep?.toggle(candidateFor(item)); paint(); });
  paint();
  actions.append(keep);
  const watch = el('button', 'shop-search-card-watch', 'この価格になったら教えて☑');
  watch.type = 'button';
  watch.addEventListener('click', () => window.HoshiluWatch?.open(candidateFor(item)));
  actions.append(watch);
  body.append(actions);
  article.append(media, body);
  return article;
}

function block(title, note, items) {
  const wrap = el('section', 'shop-search-block');
  wrap.append(el('h3', 'shop-search-block-title', title));
  if (note) wrap.append(el('p', 'shop-search-block-note', note));
  const grid = el('div', 'shop-search-grid');
  for (const item of items) grid.append(card(item));
  wrap.append(grid);
  return wrap;
}

async function saveDemand(query, state, status) {
  status.textContent = '預かっています…';
  try {
    const response = await fetch('/api/shops/demand', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, result_state: state }) });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'DEMAND_FAILED');
    writeDemands([...readDemands(), payload.demand_id]);
    status.replaceChildren();
    status.append(el('strong', '', 'ホシっときました。'), document.createTextNode(' 登録ショップに商品が入ったら、条件に合うか HOSHILU が確かめてお知らせします。'));
    if (!payload.member) {
      const login = el('a', 'shop-search-login', '無料登録すると、見つかった時にメール／LINEでお知らせできます →');
      login.href = `/login.html?next=${encodeURIComponent(`/?shop_search=${encodeURIComponent(query)}#tab-shops`)}`;
      status.append(document.createElement('br'), login);
    }
    document.dispatchEvent(new CustomEvent('hoshilu:wish-saved', { detail: { source: 'shop-demand' } }));
  } catch (error) {
    status.textContent = String(error?.message || '') === 'QUERY_CONTAINS_CONTACT' ? 'メールアドレスやURLは預かれません。欲しいものの条件だけを入れてください。' : '預かれませんでした。もう一度お試しください。';
  }
}

function demandBlock(query, state, conditions) {
  const wrap = el('section', 'shop-search-block shop-search-demand');
  wrap.append(el('h3', 'shop-search-block-title', state === 'NONE' ? '今は見つかりませんでした' : '条件どおりの商品は、まだありません'));
  wrap.append(el('p', 'shop-search-block-note', 'HOSHILUが探し続けます。登録ショップに商品が入ったら、条件に合うか確かめてお知らせします。'));
  if (conditions.length) {
    wrap.append(el('p', 'shop-search-demand-label', '探している条件'));
    wrap.append(conditionChips(conditions, 'pending'));
  }
  const button = el('button', 'shop-search-demand-button', 'ホシっとく');
  button.type = 'button';
  const status = el('p', 'shop-search-demand-status');
  status.setAttribute('role', 'status');
  button.addEventListener('click', () => { button.disabled = true; saveDemand(query, state, status); });
  wrap.append(button, status);
  return wrap;
}

function render(payload) {
  results.replaceChildren();
  const summary = el('p', 'shop-search-summary');
  summary.append(document.createTextNode(`${payload.shops_searched} ショップを横断検索`));
  if (payload.conditions?.length) { summary.append(document.createTextNode(' ・ 条件: ')); summary.append(conditionChips(payload.conditions, 'query')); }
  results.append(summary);
  if (payload.exact?.length) results.append(block('条件に一致する商品', `${payload.exact.length}件。すべての条件が商品名に明記されています。`, payload.exact));
  if (payload.near?.length) results.append(block('近い商品も見つかりました', '一致した条件は ✓、違う条件は △ で示しています。', payload.near));
  if (!payload.exact?.length) results.append(demandBlock(payload.demand_query || payload.query, payload.state, payload.conditions || []));
  results.classList.remove('hidden');
}

let inflight = 0;
function filterParams() {
  const params = new URLSearchParams();
  if (!form) return params;
  for (const name of ['genre', 'subgenre', 'color', 'material', 'size', 'brand']) {
    const value = String(form.elements[name]?.value || '').trim();
    if (value) params.set(name, value);
  }
  return params;
}
async function search(query) {
  const value = String(query || '').trim();
  const params = filterParams();
  if (value.length < 2 && ![...params.keys()].length) { input?.focus(); return; }
  params.set('q', value);
  const id = ++inflight;
  results.classList.remove('hidden');
  results.replaceChildren(el('p', 'shop-search-summary', '登録ショップの商品を横断検索しています…'));
  document.dispatchEvent(new CustomEvent('hoshilu:shop-search-started', { detail: { query: value } }));
  try {
    const response = await fetch(`/api/shops/search?${params.toString()}`, { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (id !== inflight) return;
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'SHOP_SEARCH_FAILED');
    render(payload);
  } catch {
    if (id !== inflight) return;
    results.replaceChildren(el('p', 'shop-search-summary', '検索できませんでした。しばらくしてからもう一度お試しください。'));
  }
}

async function claimDemands() {
  const ids = readDemands();
  if (!ids.length) return;
  try {
    const response = await fetch('/api/shops/demand/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ demand_ids: ids }) });
    if (response.status === 401) return;
    const payload = await response.json();
    if (response.ok && payload.ok === true) writeDemands([]);
  } catch {}
}

let filterCatalog = null;
async function loadFilters() {
  if (!form || !filtersBox) return;
  try {
    const response = await fetch('/api/shops/filters', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) return;
    filterCatalog = payload;
    const fill = (select, items, valueKey, labelKey) => {
      if (!select) return;
      select.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: '指定なし' }));
      for (const item of items) select.append(Object.assign(document.createElement('option'), { value: text(item[valueKey]), textContent: text(item[labelKey]) }));
    };
    fill(form.elements.genre, payload.genres || [], 'label', 'label');
    fill(form.elements.color, payload.colors || [], 'value', 'label');
    fill(form.elements.material, payload.materials || [], 'value', 'label');
    form.elements.genre?.addEventListener('change', () => {
      const genre = (filterCatalog?.genres || []).find((item) => item.label === form.elements.genre.value);
      fill(form.elements.subgenre, genre?.subgenres || [], 'query', 'label');
    });
  } catch {}
}

async function loadPopular() {
  if (!popular) return;
  try {
    const response = await fetch('/api/shops/demand/popular', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) { popular.classList.add('hidden'); return; }
    popular.replaceChildren(el('p', 'shop-search-popular-title', 'みんなが今探しているもの'));
    const list = el('div', 'shop-search-popular-list');
    for (const item of items) {
      const chip = el('button', 'shop-search-popular-chip');
      chip.type = 'button';
      chip.append(el('span', '', `${String.fromCodePoint(0x1F50E)} ${text(item.query)}`), el('small', '', `${Number(item.people)}人`));
      chip.addEventListener('click', () => { if (input) input.value = text(item.query); search(item.query); });
      list.append(chip);
    }
    popular.append(list);
    popular.classList.remove('hidden');
  } catch { popular.classList.add('hidden'); }
}

if (section && form && input && results) {
  form.addEventListener('submit', (event) => { event.preventDefault(); search(input.value); });
  const fromUrl = new URLSearchParams(location.search).get('shop_search');
  if (fromUrl) {
    input.value = fromUrl;
    window.HoshiluTabs?.activate('shops', { scroll: false });
    history.replaceState(null, '', `${location.pathname}#tab-shops`);
    search(fromUrl);
  }
  claimDemands();
  loadFilters();
  loadPopular();
  window.HoshiluShopSearch = { search };
}
