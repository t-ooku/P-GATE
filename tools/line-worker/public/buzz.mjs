// HOSHILU BUZZ ページ。/api/buzz/shelf の内容だけを表示する。
// クライアント側で順位・価格・レビュー数を作らない(サーバーが返した実データのみ)。
// 2026-08-19: 大隆さん指示でHOSHILU本体のトンマナへ全面刷新。棚ごとの出典表記は
// 出さない(根拠はAPIレスポンスとページ最下部の注記に集約)。
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

function itemCard(item, marketplace) {
  const card = el('a', 'card product-primary-link ranking-product-card');
  card.href = text(item.product_url);
  card.target = '_blank';
  card.rel = 'noopener sponsored';
  card.dataset.marketplace = text(marketplace);
  const thumb = el('div', 'thumb');
  if (item.image_url) {
    const img = document.createElement('img');
    img.src = text(item.image_url);
    img.alt = '';
    img.loading = 'lazy';
    thumb.append(img);
  }
  const rankNumber = Number(item.rank) || 0;
  const rankClass = rankNumber >= 1 && rankNumber <= 3 ? `rank rank-${rankNumber}` : 'rank';
  thumb.append(el('span', rankClass, `${rankNumber || ''}位`));
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
  return `${shelf.label}、${shelf.headline}\n${names.join('\n')}\n#ホシル #HOSHILUBUZZ`;
}

function buzzShareUrl(content) {
  const url = new URL('/buzz', location.origin);
  url.search = new URLSearchParams({
    utm_source: 'user_share', utm_medium: 'social',
    utm_campaign: 'hoshilu_buzz', utm_content: content
  }).toString();
  return url.toString();
}

async function shareShelf(shelf, button) {
  const shelfId = text(shelf.shelf_id).replace(/[^a-z0-9_-]/giu, '').slice(0, 48) || 'unknown';
  const shareData = { title: `HOSHILU BUZZ｜${shelf.label}`, text: shelfShareText(shelf), url: buzzShareUrl(`shelf_${shelfId}`) };
  try {
    if (navigator.share) { await navigator.share(shareData); return; }
    await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
    button.textContent = 'コピーしました';
    setTimeout(() => { button.textContent = '友達に送る'; }, 2000);
  } catch {}
}

function renderShelves(result) {
  const themeLabel = document.querySelector('#buzzThemeLabel');
  if (themeLabel && result.theme?.label) themeLabel.textContent = `今のテーマ：${text(result.theme.label)}｜${text(result.theme.rotation)}`;
  shelvesRoot.textContent = '';
  for (const shelf of result.shelves || []) {
    const section = el('section', 'shelf');
    const head = el('div', 'shelf-head');
    const title = shelf.emoji ? `${text(shelf.emoji)} ${text(shelf.label)}` : text(shelf.label);
    head.append(el('h2', '', title), el('span', 'headline', text(shelf.headline)));
    const shelfShare = el('button', 'shelf-share share-discovery-button', '友達に送る');
    shelfShare.type = 'button';
    shelfShare.addEventListener('click', () => shareShelf(shelf, shelfShare));
    head.append(shelfShare);
    const rail = el('div', 'rail');
    for (const item of shelf.items || []) rail.append(itemCard(item, shelf.marketplace));
    if (!(shelf.items || []).length) rail.append(el('p', 'status', '公式ランキングを確認中です。韓国コスメの検索入口はそのまま利用できます。'));
    section.append(head, rail);
    // v3.1 §11-14: 「◯◯で探す」= 検索結果へのフォールバック。商品ページ直行の
    // 「見る」とは別物なので、サーバーが返したラベルをそのまま使う(創作しない)。
    if (Array.isArray(shelf.search_links) && shelf.search_links.length) {
      const chips = el('div', 'search-chips');
      chips.append(el('span', 'search-chips-label', '他モールで探す:'));
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

async function loadBuzzNotificationPreference() {
  const login = document.querySelector('#buzzNotifyLogin');
  const control = document.querySelector('#buzzNotifyControl');
  const toggle = document.querySelector('#buzzNotifyToggle');
  const status = document.querySelector('#buzzNotifyStatus');
  const next = '/buzz?member=logged-in&buzz_notify=1';
  if (login) login.href = `/login.html?${new URLSearchParams({ next })}`;
  try {
    const session = await fetch('/api/member/session', { cache: 'no-store' });
    if (!session.ok) return;
    const response = await fetch('/api/member/buzz-preferences', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (login) login.hidden = true;
    if (control) control.hidden = false;
    if (toggle) toggle.checked = Boolean(data.preference?.enabled);
    const requested = new URL(location.href).searchParams.get('buzz_notify') === '1';
    if (requested && status && !toggle.checked) status.textContent = '「テーマ更新通知を受け取る」をオンにすると設定が完了します。';
  } catch {}
}

document.querySelector('#buzzNotifyToggle')?.addEventListener('change', async (event) => {
  const toggle = event.currentTarget;
  const status = document.querySelector('#buzzNotifyStatus');
  toggle.disabled = true;
  try {
    const response = await fetch('/api/member/buzz-preferences', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: toggle.checked, language: 'JA' })
    });
    if (!response.ok) throw new Error('SAVE_FAILED');
    status.textContent = toggle.checked
      ? '設定しました。次のテーマ更新から通知します。'
      : 'テーマ更新通知を停止しました。';
  } catch {
    toggle.checked = !toggle.checked;
    status.textContent = '設定を保存できませんでした。もう一度お試しください。';
  } finally { toggle.disabled = false; }
});

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
  const shareData = { title: 'HOSHILU BUZZ', text: '今、これ来てる。小ジャンル別の「いま売れてる」まとめ', url: buzzShareUrl('buzz_page') };
  try {
    if (navigator.share) { await navigator.share(shareData); return; }
    await navigator.clipboard.writeText(shareData.url);
    const button = document.querySelector('#shareBuzz');
    if (button) { button.textContent = 'リンクをコピーしました'; setTimeout(() => { button.textContent = 'シェア'; }, 2000); }
  } catch {}
});

load();
loadBuzzNotificationPreference();
