// ホームのHOSHILU BUZZ棚 (2026-08-19 大隆さん指示: 目立つ箇所=検索直下へ設置)。
// /api/buzz/shelf の実データだけを表示する。クライアント側で順位・価格・
// 人気を創作しない。棚は最初の3つ+「すべて見る」導線に絞り、ホームを重くしない。
const root = document.querySelector('#buzzHomeShelves');
const HOME_SHELF_LIMIT = 3;

const text = (value) => String(value ?? '');
const yen = (value) => `¥${Number(value).toLocaleString('ja-JP')}`;

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function itemCard(item) {
  const card = el('a', 'buzz-home-card');
  card.href = text(item.product_url);
  card.target = '_blank';
  card.rel = 'noopener sponsored';
  const thumb = el('div', 'buzz-home-thumb');
  if (item.image_url) {
    const img = document.createElement('img');
    img.src = text(item.image_url);
    img.alt = '';
    img.loading = 'lazy';
    thumb.append(img);
  }
  thumb.append(el('span', 'buzz-home-rank', `${Number(item.rank) || ''}位`));
  card.append(thumb);
  if (item.movement) card.append(el('p', 'buzz-home-move', text(item.movement)));
  card.append(el('p', 'buzz-home-name', text(item.name)));
  card.append(el('p', 'buzz-home-price', item.price_confirmed ? yen(item.price) : '価格はモールで確認'));
  return card;
}

function render(result) {
  root.textContent = '';
  const shelves = (result.shelves || []).slice(0, HOME_SHELF_LIMIT);
  if (!shelves.length) {
    // 取得できない時は枠ごと畳む(ホームに空箱を残さない)。
    document.querySelector('#buzzHome')?.classList.add('hidden');
    return;
  }
  for (const shelf of shelves) {
    const block = el('div', 'buzz-home-shelf');
    const head = el('div', 'buzz-home-shelf-head');
    head.append(el('h3', '', shelf.emoji ? `${text(shelf.emoji)} ${text(shelf.label)}` : text(shelf.label)), el('span', 'buzz-home-headline', text(shelf.headline)));
    const rail = el('div', 'buzz-home-rail');
    for (const item of (shelf.items || []).slice(0, 6)) rail.append(itemCard(item));
    const more = el('a', 'buzz-home-railmore', 'もっと見る →');
    more.href = '/buzz';
    rail.append(more);
    // 2026-08-19 大隆さん指示: 棚ごとの出典表記は出さない(枠下の注記に集約)。
    block.append(head, rail);
    root.append(block);
  }
}

async function load() {
  try {
    const response = await fetch('/api/buzz/shelf', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'BUZZ_SHELF_FAILED');
    render(payload.result || {});
  } catch {
    document.querySelector('#buzzHome')?.classList.add('hidden');
  }
}

load();
