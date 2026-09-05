// 2026-09-05 夜 大隆さん決定: 「みんなが値下がりを待ってる商品」（値下がり待ちリスト）。
// /api/price-watch/demand の匿名集計（5人以上の商品だけ）をそのまま出す。
// クライアント側で人数・価格・順位を作らない。行をタップすると同じ商品名で
// HOSHILU 検索が開き、自分の「この価格になったら教えて☑」を押せる。
const root = document.querySelector('#watchDemandList');
const section = document.querySelector('#watchDemand');

const text = (value) => String(value ?? '');
const yen = (value) => `¥${Number(value).toLocaleString('ja-JP')}`;

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function row(item) {
  const link = el('a', 'watch-demand-row');
  link.href = text(item.search_url || '/');
  link.title = text(item.full_name || item.product_name);
  link.append(
    el('span', 'watch-demand-rank', `${Number(item.rank) || ''}`),
    el('span', 'watch-demand-name', text(item.product_name))
  );
  const meta = el('span', 'watch-demand-meta');
  meta.append(
    el('strong', '', `${Number(item.waiting_members) || 0}人が待ってる`),
    el('small', '', item.average_target_price_jpy ? `希望額の平均 ${yen(item.average_target_price_jpy)}` : '')
  );
  link.append(meta);
  return link;
}

function render(result) {
  root.textContent = '';
  const items = Array.isArray(result.items) ? result.items : [];
  if (!items.length) {
    // まだ5人以上集まった商品が無い間は、空箱ではなく「1票目」を誘う一行にする。
    const empty = el('p', 'watch-demand-empty');
    empty.append(
      el('span', '', `${Number(result.min_members) || 5}人以上が同じ商品を待つと、ここに出ます。`),
      el('a', 'watch-demand-empty-link', '欲しいものを検索して「この価格になったら教えて☑」を押す →')
    );
    empty.querySelector('a').href = '#query';
    root.append(empty);
    return;
  }
  for (const item of items) root.append(row(item));
}

async function load() {
  if (!root || !section) return;
  try {
    const response = await fetch('/api/price-watch/demand', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'DEMAND_FAILED');
    render(payload.result || {});
  } catch {
    section.classList.add('hidden');
  }
}

load();
