// ホームのHOSHILU BUZZ棚 (2026-08-19 大隆さん指示: 目立つ箇所=検索直下へ設置)。
// /api/buzz/shelf の実データだけを表示する。クライアント側で順位・価格・
// 人気を創作しない。棚は5種類+「すべて見る」導線（2026-09-05 夜 大隆さん訂正: 「3列→5列」は棚の数のこと）。
// 2026-10-07 大隆さん指示「やはり、ホシルバズのページを設けよう。探すページにも残しつつ、ホシルバズのページもある状態に」:
// 1 回の取得で 2 か所に描く。探すタブ（#buzzHomeShelves）は先頭の数棚だけ＋「ホシルバズで全部見る」、
// ホシルバズタブ（#buzzTabShelves）は全部の棚を「トレンド先取り」「みんなのバズ」の見出しつきで並べる（順位・商品は API のまま）。
const SEARCH_SHELF_LIMIT = 3;
const TARGETS = [
  { root: document.querySelector('#buzzHomeShelves'), limit: SEARCH_SHELF_LIMIT, idPrefix: 'buzzShelf-', groups: false, moreToTab: true },
  { root: document.querySelector('#buzzTabShelves'), limit: Infinity, idPrefix: 'buzzTabShelf-', groups: true, moreToTab: false }
].filter((target) => target.root);
const GROUP_HEADINGS = Object.freeze({ trend: '✨ トレンド先取り', rest: '🔥 みんなのバズ' });
// 探すタブ見出しの「すべて見る →」もホシルバズタブへ。
const headerMore = document.querySelector('#buzzHome .buzz-home-more');
if (headerMore) headerMore.href = '#tab-buzz';

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
  card.dataset.marketplace = text(item.marketplace);
  const thumb = el('div', 'buzz-home-thumb');
  if (item.image_url) {
    const img = document.createElement('img');
    // 2026-09-17: 楽天 128px サムネは荒いので、画像サーバーに 300px を要求する（app.js の HoshiluImage）。
    img.src = window.HoshiluImage?.upgrade(text(item.image_url), 300) || text(item.image_url);
    img.alt = '';
    img.loading = 'lazy';
    thumb.append(img);
  }
  thumb.append(el('span', 'buzz-home-rank', `${Number(item.rank) || ''}位`));
  card.append(thumb);
  if (item.movement) card.append(el('p', 'buzz-home-move', text(item.movement)));
  card.append(el('p', 'buzz-home-name', text(item.name)));
  card.append(el('p', 'buzz-home-price', item.price_confirmed ? yen(item.price) : '価格はモールで確認'));
  // 2026-09-16 大隆さん指示「ホシルバズも、希望価格ウォッチが必要」: 検索結果と同じ
  // 「この価格になったら教えて☑」を各カードに。ダイアログ本体は app.js の HoshiluWatch を使う
  // （価格が確認できている商品だけ。button は a の中に置けないので、カードを包む）。
  const wrap = el('div', 'buzz-home-item');
  wrap.append(card);
  // 2026-09-22 大隆さん指示「ホシルバズも、『価格』『気になる』に修正して2列1行」。
  // 縦に2段積むとカードが縦長になるので、横に2つ並べる。
  const actions = el('div', 'buzz-home-actions');
  wrap.append(actions);
  if (item.price_confirmed && item.price > 0) {
    const watch = el('button', 'buzz-home-watch watch-settings-button', '🔔 価格通知');
    watch.type = 'button';
    watch.addEventListener('click', (event) => {
      event.preventDefault();
      window.HoshiluWatch?.open({
        display_name: text(item.name), product_name: text(item.name), image_url: text(item.image_url),
        record_key: text(item.record_key), target_product_key: text(item.record_key),
        offers: [{ marketplace: text(item.marketplace), product_url: text(item.product_url), price: Number(item.price), total_cost: Number(item.price), currency: 'JPY' }]
      });
    });
    actions.append(watch);
  }
  // 2026-09-16 大隆さん指示: BUZZ の商品にも「気になる」（ハート）。保存先は検索結果と同じ（HoshiluKeep）。
  const candidate = {
    record_key: text(item.record_key), display_name: text(item.name), product_name: text(item.name), image_url: text(item.image_url),
    marketplace: text(item.marketplace), product_url: text(item.product_url),
    offers: [{ marketplace: text(item.marketplace), product_url: text(item.product_url), price: Number(item.price) || 0, total_cost: Number(item.price) || 0 }]
  };
  const heart = el('button', 'buzz-home-keep');
  heart.type = 'button';
  const paint = () => {
    const kept = Boolean(window.HoshiluKeep?.isKept(candidate));
    heart.textContent = kept ? '♥ 気になる' : '♡ 気になる';
    heart.classList.toggle('kept', kept);
    heart.setAttribute('aria-pressed', kept ? 'true' : 'false');
  };
  heart.addEventListener('click', (event) => { event.preventDefault(); window.HoshiluKeep?.toggle(candidate); paint(); });
  document.addEventListener('hoshilu:kept-changed', paint);
  paint();
  actions.append(heart);
  // 2026-10-02 指示書「今ほしい人が買うためのサービス」§10: BUZZ から「今いくら？」（商品詳細）へ。
  if (/^(?:RAKUTEN:|YAHOO:|JAN:)/u.test(text(item.record_key)) && !/^(?:RAKUTEN|YAHOO):https?:/iu.test(text(item.record_key))) {
    // 2026-10-08 大隆さん指示「価格推移のリンクは、ボタン枠を目立つ様にして『過去の価格と比べる』に。ボタンの色もオシャレに」。
    const detail = el('a', 'buzz-home-detail', '過去の価格と比べる');
    detail.href = `/product?key=${encodeURIComponent(text(item.record_key))}&from=buzz`;
    wrap.append(detail);
  }
  return wrap;
}

// 2026-09-20 大隆さん指示「Googleも最大限活用」: 棚のジャンル名で HOSHILU 検索を実行する
// （楽天・Yahoo! の API 結果に加え、他モールは Google（Agent Search）の枠が出る）。ここで新しい API は呼ばない。
function searchOnHoshilu(keyword) {
  const query = document.querySelector('#query');
  const form = document.querySelector('#knowledgeForm');
  if (!query || !form || !keyword) return;
  query.value = keyword;
  query.dispatchEvent(new Event('input', { bubbles: true }));
  window.HoshiluTabs?.activate('search', { scroll: false });
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

// ジャンルの帯（横スクロール）: 押すとその棚へ移動。棚は API が返した分だけ（創作しない）。
function genreNav(shelves, idPrefix) {
  const nav = el('nav', 'buzz-home-genres');
  nav.setAttribute('aria-label', 'ランキングのジャンル');
  for (const shelf of shelves) {
    const chip = el('button', 'buzz-home-genre-chip', shelf.emoji ? `${text(shelf.emoji)} ${text(shelf.label)}` : text(shelf.label));
    chip.type = 'button';
    chip.addEventListener('click', () => {
      document.getElementById(`${idPrefix}${text(shelf.shelf_id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    nav.append(chip);
  }
  return nav;
}

function render(result) {
  for (const target of TARGETS) renderInto(target, result);
}

function renderInto({ root, limit, idPrefix, groups, moreToTab }, result) {
  root.textContent = '';
  const allShelves = result.shelves || [];
  const shelves = allShelves.slice(0, limit);
  if (!shelves.length) {
    // 2026-09-20: 専用タブになったので枠は畳まず、取れていない事実だけを書く（順位は作らない）。
    root.append(el('p', 'buzz-home-loading', '公式ランキングを取得できませんでした。少し待ってから開き直してください。'));
    return;
  }
  if (shelves.length > 3) root.append(genreNav(shelves, idPrefix));
  let lastGroup = '';
  for (const shelf of shelves) {
    if (groups) {
      const group = shelf.shelf_group === 'trend' ? 'trend' : 'rest';
      if (group !== lastGroup) {
        // トレンド先取りの棚が無い時は見出しも出さない（作らない）。
        if (group === 'trend' || allShelves.some((entry) => entry.shelf_group === 'trend')) root.append(el('h3', `buzz-group-head buzz-group-${group}`, GROUP_HEADINGS[group]));
        lastGroup = group;
      }
    }
    const block = el('div', 'buzz-home-shelf');
    block.id = `${idPrefix}${text(shelf.shelf_id)}`;
    const head = el('div', 'buzz-home-shelf-head');
    head.append(el('h3', '', shelf.emoji ? `${text(shelf.emoji)} ${text(shelf.label)}` : text(shelf.label)), el('span', 'buzz-home-headline', text(shelf.headline)));
    // 2026-09-05 夜 大隆さん訂正: 横スクロールの棚に戻す。2026-09-20: 棚が返した件数をそのまま並べる（主婦層ジャンルは 10 件）。
    const rail = el('div', 'buzz-home-rail');
    for (const item of (shelf.items || [])) rail.append(itemCard(item));
    const more = el('a', 'buzz-home-railmore', 'もっと見る →');
    more.href = '/buzz';
    rail.append(more);
    if (shelf.search_keyword) {
      // 2026-10-07 大隆さん指示「二行になっているのダサい。『○○を他のモールでも探す』でよい」: 短くして 1 行に収める。
      const google = el('button', 'buzz-home-google', `${text(shelf.search_keyword)}を他のモールでも探す`);
      google.title = google.textContent;
      google.type = 'button';
      google.addEventListener('click', () => searchOnHoshilu(text(shelf.search_keyword)));
      block.append(head, rail, google);
      root.append(block);
      continue;
    }
    // 2026-08-19 大隆さん指示: 棚ごとの出典表記は出さない(枠下の注記に集約)。
    block.append(head, rail);
    root.append(block);
  }
  if (moreToTab && allShelves.length > shelves.length) {
    const more = el('a', 'buzz-home-tabmore', `ホシルバズで全部見る（${allShelves.length}ランキング）→`);
    more.href = '#tab-buzz';
    root.append(more);
  }
}

async function load() {
  if (!TARGETS.length) return;
  try {
    const response = await fetch('/api/buzz/shelf', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'BUZZ_SHELF_FAILED');
    render(payload.result || {});
  } catch {
    render({});
  }
}

load();
