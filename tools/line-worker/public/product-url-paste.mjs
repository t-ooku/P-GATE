// 2026-09-20 GPT 指示書 §P0「URL 貼り付け→ホシっとく」（大隆さん承認）
// 検索窓に 13 モールの商品ページ URL を 1 本だけ貼って検索すると、本検索の代わりに
// /api/product-url/identify でそのページの商品名・画像・価格（ページに書かれた JPY だけ）を読み、
// 「この商品ですか？」カードを出す。価格が読めない時は「自動追跡できません」と書く（推測しない）。
// app.js は触らない: 送信を document の capture で先に受け、URL の時だけ止める。
const PRODUCT_HOSTS = /(?:^|\.)(?:amazon\.co\.jp|amazon\.com|rakuten\.co\.jp|shopping\.yahoo\.co\.jp|qoo10\.jp|shein\.com|zozo\.jp|shop-list\.com|musinsa\.com|buyma\.com|snkrdunk\.com)$/iu;
const form = document.querySelector('#knowledgeForm');
const query = document.querySelector('#query');
const results = document.querySelector('#resultsSection');
const yen = (value) => `¥${Number(value).toLocaleString('ja-JP')}`;

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

export function productUrlIn(text) {
  const value = String(text || '').trim();
  if (!/^https?:\/\/\S+$/iu.test(value)) return null;
  try { const url = new URL(value); return PRODUCT_HOSTS.test(url.hostname) ? url.href.replace(/^http:\/\//iu, 'https://') : null; } catch { return null; }
}

function card() {
  let node = document.querySelector('#productUrlCard');
  if (!node) {
    node = el('section', 'product-url-card');
    node.id = 'productUrlCard';
    node.setAttribute('aria-live', 'polite');
    (results || form).insertAdjacentElement(results ? 'beforebegin' : 'afterend', node);
  }
  node.classList.remove('hidden');
  return node;
}

function render(product) {
  const node = card();
  node.replaceChildren();
  node.append(el('p', 'step', 'URL から見つけた商品'), el('h2', '', 'この商品ですか？'));
  const row = el('div', 'product-url-row');
  const media = el('div', 'product-url-media');
  if (product.image_url) { const img = document.createElement('img'); img.src = product.image_url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; media.append(img); }
  else media.append(el('span', 'product-url-media-fallback', String(product.name || '').slice(0, 2)));
  const body = el('div', 'product-url-body');
  body.append(el('span', 'product-url-mall', product.marketplace_label || ''), el('strong', 'product-url-name', product.name || ''));
  body.append(el('span', product.price_available ? 'product-url-price' : 'product-url-price-missing', product.price_available ? `${yen(product.price_jpy)}（${product.price_note}）` : product.price_note));
  const open = el('a', 'product-url-open', '商品ページを見る →'); open.href = product.url; open.target = '_blank'; open.rel = 'noopener noreferrer';
  body.append(open);
  row.append(media, body);
  const actions = el('div', 'product-url-actions');
  if (product.price_available) {
    const watch = el('button', 'product-url-watch watch-settings-button', 'この価格になったら教えて☑'); watch.type = 'button';
    watch.addEventListener('click', () => window.HoshiluWatch?.open({
      display_name: product.name, product_name: product.name, image_url: product.image_url, record_key: product.url, target_product_key: product.url,
      offers: [{ marketplace: product.marketplace, product_url: product.url, price: product.price_jpy, total_cost: product.price_jpy, currency: 'JPY' }]
    }));
    actions.append(watch);
  }
  const search = el('button', 'product-url-search', 'この商品名で HOSHILU で探す（ホシっとく）'); search.type = 'button';
  search.addEventListener('click', () => {
    query.value = product.name; query.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  actions.append(search);
  node.append(row, actions, el('p', 'product-url-note', '価格はページに書かれていたもの（取得時点）です。HOSHILU が API で確認した価格ではありません。'));
  node.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFailure(reason) {
  const node = card();
  const copy = { NOT_PRODUCT_URL: 'この URL は対応モールの商品ページではないようです。商品名で探してみてください。', TIMEOUT: 'ページの読み込みに時間がかかっています。もう一度お試しください。', PRODUCT_NOT_FOUND: 'このページから商品名を読み取れませんでした。商品名で探してみてください。' };
  node.replaceChildren(el('p', 'step', 'URL から見つけた商品'), el('p', 'product-url-note', copy[reason] || 'このページを読み取れませんでした。商品名で探してみてください。'));
}

if (form && query) {
  document.addEventListener('submit', async (event) => {
    if (event.target !== form) return;
    const url = productUrlIn(query.value);
    if (!url) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const node = card();
    node.replaceChildren(el('p', 'step', 'URL から見つけた商品'), el('p', 'product-url-note', 'ページを読み取っています…'));
    try {
      const response = await fetch('/api/product-url/identify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.product) render(payload.product); else renderFailure(payload?.error || 'FETCH_FAILED');
    } catch { renderFailure('FETCH_FAILED'); }
  }, true);
}
