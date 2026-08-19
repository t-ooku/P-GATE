// HOSHILU BUZZ ページ (Phase 1)。/api/buzz/shelf の内容だけを表示する。
// クライアント側で順位・価格・レビュー数を作らない(サーバーが返した実データのみ)。
const shelvesRoot = document.querySelector('#buzzShelves');
const note = document.querySelector('#buzzNote');

const text = (value) => String(value ?? '');
const yen = (value) => `¥${Number(value).toLocaleString('ja-JP')}`;

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function itemCard(item) {
  const card = el('a', 'card');
  card.href = text(item.product_url);
  card.target = '_blank';
  card.rel = 'noopener sponsored';
  const thumb = el('div', 'thumb');
  if (item.image_url) {
    const img = document.createElement('img');
    img.src = text(item.image_url);
    img.alt = '';
    img.loading = 'lazy';
    thumb.append(img);
  }
  thumb.append(el('span', 'rank', `${Number(item.rank) || ''}位`));
  card.append(thumb);
  if (item.movement) card.append(el('p', 'move', text(item.movement)));
  if (item.context_label) card.append(el('p', 'context', text(item.context_label)));
  card.append(el('p', 'name', text(item.name)));
  card.append(item.price_confirmed
    ? el('p', 'price', yen(item.price))
    : el('p', 'price', '価格はモールで確認'));
  if (Number(item.review_count) > 0) {
    card.append(el('p', 'review', `★${Number(item.review_average).toFixed(1)}（${Number(item.review_count).toLocaleString('ja-JP')}件）`));
  }
  return card;
}

// §22/§24: ランキングはそのままSNSコンテンツになる。実データの商品名だけで
// シェア文を組み立てる(数値や人気の創作はしない)。
function shelfShareText(shelf) {
  const names = (shelf.items || []).slice(0, 5).map((item, index) => `${index + 1}. ${item.name.slice(0, 30)}`);
  return `${shelf.label}、${shelf.headline}\n（出典: ${shelf.ranking_type}）\n${names.join('\n')}\n#ホシル`;
}

async function shareShelf(shelf, button) {
  const shareData = { title: `HOSHILU BUZZ｜${shelf.label}`, text: shelfShareText(shelf), url: 'https://hoshilu.app/buzz' };
  try {
    if (navigator.share) { await navigator.share(shareData); return; }
    await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
    button.textContent = 'コピーしました';
    setTimeout(() => { button.textContent = '友達に送る'; }, 2000);
  } catch {}
}

function renderShelves(result) {
  shelvesRoot.textContent = '';
  for (const shelf of result.shelves || []) {
    const section = el('section', 'shelf');
    const head = el('div', 'shelf-head');
    head.append(el('h2', '', text(shelf.label)), el('span', 'headline', text(shelf.headline)));
    const shelfShare = el('button', 'shelf-share', '友達に送る');
    shelfShare.type = 'button';
    shelfShare.addEventListener('click', () => shareShelf(shelf, shelfShare));
    head.append(shelfShare);
    const source = el('p', 'shelf-source', `出典: ${text(shelf.ranking_type)}`);
    const rail = el('div', 'rail');
    for (const item of shelf.items || []) rail.append(itemCard(item));
    section.append(head, source, rail);
    // v3.1 §11-14: 「◯◯で探す」= 検索結果へのフォールバック。商品ページ直行の
    // 「見る」とは別物なので、サーバーが返したラベルをそのまま使う(創作しない)。
    if (Array.isArray(shelf.search_links) && shelf.search_links.length) {
      const chips = el('div', 'search-chips');
      for (const link of shelf.search_links) {
        const chip = el('a', 'search-chip', text(link.label));
        chip.href = text(link.url);
        chip.target = '_blank';
        chip.rel = 'noopener';
        chips.append(chip);
      }
      section.append(chips);
    }
    shelvesRoot.append(section);
  }
  if (!(result.shelves || []).length) {
    shelvesRoot.append(el('p', 'status', 'いまランキングを取得できません。時間をおいて再読み込みしてください。'));
  }
  note.textContent = `${text(result.methodology)} ${text(result.disclaimer)}`;
}

async function load() {
  try {
    const response = await fetch('/api/buzz/shelf', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'BUZZ_SHELF_FAILED');
    renderShelves(payload.result || {});
  } catch {
    shelvesRoot.textContent = '';
    shelvesRoot.append(el('p', 'status', 'いまランキングを取得できません。時間をおいて再読み込みしてください。'));
  }
}

document.querySelector('#shareBuzz')?.addEventListener('click', async () => {
  const shareData = { title: 'HOSHILU BUZZ', text: '今、これ来てる。小ジャンル別の「いま売れてる」まとめ', url: 'https://hoshilu.app/buzz' };
  try {
    if (navigator.share) { await navigator.share(shareData); return; }
    await navigator.clipboard.writeText(shareData.url);
    const button = document.querySelector('#shareBuzz');
    if (button) { button.textContent = 'リンクをコピーしました'; setTimeout(() => { button.textContent = 'シェア'; }, 2000); }
  } catch {}
});

load();
