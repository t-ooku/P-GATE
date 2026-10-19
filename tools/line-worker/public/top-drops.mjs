// 2026-10-19 大隆さん OK（入口の改善案 2）: トップの検索窓のすぐ下に「今日の値下がり」を 3 つ出す。
// 中身は値下がりページ（/media/price-drops）と同じホシルの価格記録・同じ並び（/api/media/top-drops）。
// 押すと商品の詳細（今の価格と購入先）へ。取れない日・0 件の日は枠ごと出さない。
const root = document.getElementById('topDrops');
const list = document.getElementById('topDropsList');
const note = document.getElementById('topDropsNote');
const yen = (value) => `¥${Math.round(Number(value) || 0).toLocaleString('ja-JP')}`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function topDropCard(item) {
  const li = el('li', 'top-drop');
  const link = el('a', 'top-drop-card');
  link.href = String(item.href || '').startsWith('/product?') ? item.href : '/media/price-drops';
  const figure = el('span', 'top-drop-figure');
  const img = el('img');
  img.src = item.image_url;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.width = 160;
  img.height = 160;
  figure.append(img, el('span', 'top-drop-rate', `-${Number(item.drop_rate) || 0}%`));
  const body = el('span', 'top-drop-body');
  if (item.genre) body.append(el('span', 'top-drop-genre', item.genre));
  body.append(el('strong', 'top-drop-name', item.name));
  const prices = el('span', 'top-drop-prices');
  prices.append(el('s', '', yen(item.max_price)), el('span', 'top-drop-arrow', '→'), el('b', '', yen(item.latest_price)));
  body.append(prices);
  if (item.mall) body.append(el('span', 'top-drop-mall', item.mall));
  link.append(figure, body);
  li.append(link);
  return li;
}

async function main() {
  if (!root || !list) return;
  try {
    const response = await fetch('/api/media/top-drops', { headers: { accept: 'application/json' } });
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items.filter((item) => /^https:\/\//u.test(String(item?.image_url || ''))) : [];
    if (!data?.ok || !items.length) return;
    list.replaceChildren(...items.slice(0, 3).map(topDropCard));
    if (note) note.textContent = String(data.note || '');
    root.classList.remove('hidden');
  } catch {}
}

if (typeof document !== 'undefined' && root) main();
