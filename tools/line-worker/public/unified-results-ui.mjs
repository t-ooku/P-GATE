// 2026-09-22 大隆さん指示書「HOSHILU 検索結果UI統合改修」の画面側。
//
// 「ホシルからの提案」と「web検索から発見」を上下に分けず、**「見つかった商品」1本**で出す。
// 並び順・重複排除・60件の上限はサーバー（src/unified-results.mjs）が決めている。
// ここは決まった順番をそのまま描くだけで、並べ替えない（§28 位置が動くのを防ぐ）。
//
// カードは小さく（§10）。出すのは:
//   ・商品画像 ・商品名（2行で切る）・ショップ名 ・ソースのバッジ
//   ・HOSHILU商品だけ 価格 ・♡ ホシっとく
// Web商品に価格は出さない。ページに書いてあった数字を読んだだけで、
// HOSHILU が API で確認したものではないから（§7）。
//
// 12件ずつ出す（§11）。60枚の画像を最初から読み込ませない。
const COPY = {
  found: (n) => `${n}件見つかりました`,
  capped: (n) => `${n}件表示中`,
  more: 'さらに見る',
  narrow: '条件を絞ると、さらに近い商品を探せます。',
  priceUnknown: '価格は商品ページで確認',
  priceListedNote: '参考価格・検索時点',
  open: '商品を見る',
  reviews: '💬 口コミ',
  keep: '♡ ホシっとく',
  kept: '♥ ホシっとく済み',
  badge: { HOSHILU: 'HOSHILU', HOSHILU_SHOP: 'HOSHILU SHOP', WEB: 'Web' }
};
const PAGE = 12;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let state = { items: [], shown: 0, candidates: [] };

// 統合した行から、元の候補（/api/search の candidates）へ戻る。
// 突き合わせはサーバーが付けた candidate_index だけで行う。名前で推測しない。
function candidateFor(item) {
  const at = Number(item?.candidate_index);
  if (!Number.isInteger(at) || at < 0) return null;
  const candidate = state.candidates[at];
  return candidate && typeof candidate === 'object' ? candidate : null;
}

function keepButton(item) {
  const button = el('button', 'unified-keep', COPY.keep);
  button.type = 'button';
  // ♡ の保存先は app.js が持っている（端末→会員）。ここでは呼ぶだけで、別の保存を作らない。
  const keep = window.HoshiluKeep;
  const candidate = {
    asin: '', display_name: item.product_name, product_name: item.product_name,
    image_url: item.image_url, product_url: item.url, marketplace: item.marketplace
  };
  const sync = () => {
    const kept = Boolean(keep?.isKept?.(candidate));
    button.classList.toggle('kept', kept);
    button.textContent = kept ? COPY.kept : COPY.keep;
  };
  if (!keep?.toggle) return null;
  sync();
  button.addEventListener('click', () => { keep.toggle(candidate); sync(); });
  document.addEventListener('hoshilu:kept-changed', sync);
  return button;
}

function card(item) {
  const article = el('article', `unified-card unified-card-${String(item.source || '').toLowerCase()}`);
  article.setAttribute('role', 'listitem');
  const link = el('a', 'unified-card-link');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.position = String(item.position || 0);
  link.dataset.source = String(item.source || '');

  const figure = el('div', 'unified-card-image');
  if (item.image_url) {
    const img = document.createElement('img');
    // 2026-09-22 大隆さん報告「画質も荒い」。スマホは画素密度が2〜3倍あるので、
    // カード幅ぶんの画像では拡大されてぼやける。同じ画像サーバーが大きいサイズを
    // 返せるモールは、URL のサイズ指定だけを書き換えて 600px を要求する
    // （画像の差し替えや再取得はしない）。
    img.src = window.HoshiluImage?.upgrade?.(item.image_url, 600) || item.image_url;
    img.alt = '';
    // 60件ぶんの画像を一度に取りに行かせない（§13）。
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    // 画像が落ちても列全体を壊さない。枠だけ残して静かに畳む。
    img.addEventListener('error', () => { img.remove(); figure.classList.add('is-empty'); }, { once: true });
    figure.append(img);
  } else {
    figure.classList.add('is-empty');
  }
  link.append(figure);

  const body = el('div', 'unified-card-body');
  // h3 にしておく。口コミ（experience-layer.mjs）は商品名を h3 から読む。
  body.append(el('h3', 'unified-card-name', item.product_name || ''));
  const meta = el('div', 'unified-card-meta');
  meta.append(el('span', `unified-badge unified-badge-${String(item.source || '').toLowerCase()}`,
    COPY.badge[item.source] || COPY.badge.WEB));
  if (item.shop_name) meta.append(el('span', 'unified-card-shop', item.shop_name));
  body.append(meta);
  // HOSHILU が API で確認できた価格は、そのまま出す。
  if (Number(item.price_jpy) > 0) {
    body.append(el('strong', 'unified-card-price', `¥${Number(item.price_jpy).toLocaleString('ja-JP')}`));
  } else if (Number(item.listed_price_jpy) > 0) {
    // 2026-09-22 大隆さん報告「価格もでてない」。Web の数字はページに書いてあっただけの
    // ものなので、確認済みの価格とは別の見た目にして「参考価格・検索時点」と断る。
    // 隠すのでもなく、同じ顔で並べるのでもない。
    body.append(el('strong', 'unified-card-price unified-card-price-listed',
      `¥${Number(item.listed_price_jpy).toLocaleString('ja-JP')}`));
    body.append(el('small', 'unified-card-price-note', COPY.priceListedNote));
  } else if (item.source === 'WEB') {
    body.append(el('span', 'unified-card-price-unknown', COPY.priceUnknown));
  }
  // 2026-09-22 大隆さん指示「2条件一致という文字削除して上に詰めて。つまりできるだけ
  // 正方形に近づけてたい」。一致の度合いは並び順にもう出ているので、文字では書かない。
  link.append(body);
  article.append(link);

  // 2026-09-22 大隆さん指示「ホシル提示は、5個ボタン設置」。
  // HOSHILU 商品は、元の候補が手元にあるので商品カードと同じ5個を出す。
  // （これ、今買う？／この価格になったら教えて／いつものにする／気になる／口コミ）
  // Web 商品は候補そのものが無い（価格も在庫も HOSHILU は確認していない）ので、
  // 出せるのは ♡ ホシっとく だけ。無いものを有るふりで並べない。
  const candidate = candidateFor(item);
  if (candidate && window.HoshiluCardActions?.attach) {
    // 口コミ（experience-layer.mjs）は .product-card を見て後から足すので、同じ札を付ける。
    article.classList.add('unified-card-full');
    const slots = window.HoshiluCardActions.attach(article, candidate);
    // 2026-09-22 大隆さん指示「口コミは、『口コミ』というボタンだけあれば良い」。
    // 中身（まだ口コミがありません／投稿する）はカードの上で場所を取りすぎるので、
    // 押したときだけ開く。口コミそのものは消していない。
    const reviews = el('button', 'unified-reviews-toggle', COPY.reviews);
    reviews.type = 'button';
    reviews.setAttribute('aria-expanded', 'false');
    reviews.addEventListener('click', () => {
      const open = article.classList.toggle('reviews-open');
      reviews.setAttribute('aria-expanded', open ? 'true' : 'false');
      // 2026-09-22 大隆さん指示「口コミはタップしたら、入力欄が開く」。
      // 入力欄を作るのは experience-layer。ここでは同じ入口（投稿ボタン）を押すだけで、
      // 口コミの作りを二重に持たない。
      if (open) article.querySelector('.experience-post')?.click();
    });
    // 並びは 価格 / いつもの / 気になる / 口コミ の4つ。2列2行に収まる（§正方形に近づける）。
    slots?.actions?.append?.(reviews);
  } else {
    const keep = keepButton(item);
    if (keep) article.append(keep);
  }
  return article;
}

// 2026-09-22 大隆さん指示「MATCHESのタイトル残した状態で、ホシルの提案とweb検索を
// 合体して、1列にして」「つまりホシル提示とweb検索提示を合体した列がMATCHESとする」。
// だからこのモジュールは見出しを持たない。ページにもとからある
// 「MATCHES / ホシルからの提案」の中身として入る。
//
// 置き場所は #resultCards の先頭。#resultsSection の中に入れても、この節は
// CSS で並び順を持っているため、見出しより上に出てしまっていた（大隆さん報告
// 「下記文字の位置が修正できてない」）。棚が並ぶ場所そのものに入れれば、
// 畳んだ古い棚とまったく同じ位置に出る。
// app.js は結果を並べ終えてからイベントを出すので、ここで入れても消されない。
let host = null;
function section() {
  if (host && host.isConnected) return host;
  const cards = document.querySelector('#resultCards');
  if (!cards) return null;
  host = document.createElement('section');
  host.id = 'unifiedResults';
  host.hidden = true;
  cards.prepend(host);
  return host;
}

// 1セクションにまとめるので、元の「ホシルからの提案」（価格まで確認できた棚と
// AI選定レコメンドの棚）と「web検索から発見」は畳む（§1）。
// レコメンド（関連商品）は別の話なので残す。
function foldLegacySections(folded) {
  const rows = document.querySelectorAll('#resultCards .result-row-confirmed,#resultCards .result-row-unconfirmed');
  for (const row of rows) row.hidden = folded;
  const google = document.querySelector('#googleMallResults');
  if (google) google.classList.toggle('hidden', folded);
}

function renderMore(host, list) {
  const remaining = state.items.length - state.shown;
  host.querySelector('.unified-more')?.remove();
  if (remaining <= 0) return;
  const button = el('button', 'unified-more', COPY.more);
  button.type = 'button';
  button.addEventListener('click', () => {
    const next = state.items.slice(state.shown, state.shown + PAGE);
    list.append(...next.map(card));
    state.shown += next.length;
    renderMore(host, list);
  });
  host.append(button);
}

export function render(unified, candidates = []) {
  const host = section();
  if (!host) return;
  const items = Array.isArray(unified?.items) ? unified.items : [];
  state = { items, shown: 0, candidates: Array.isArray(candidates) ? candidates : [] };
  host.replaceChildren();
  if (!items.length) { host.hidden = true; foldLegacySections(false); return; }
  host.hidden = false;
  foldLegacySections(true);

  // 見出しは作らない。ページの「MATCHES / ホシルからの提案」がこの列の見出し。
  // 「全部で60件しかない」と誤解させない（§9）。上限で切ったときは「60件表示中」。
  const head = el('div', 'unified-head');
  const count = unified.truncated ? COPY.capped(items.length) : COPY.found(items.length);
  head.append(el('span', 'unified-count', count));
  host.append(head);

  const list = el('div', 'unified-list');
  list.setAttribute('role', 'list');
  const first = items.slice(0, PAGE);
  list.append(...first.map(card));
  state.shown = first.length;
  host.append(list);
  renderMore(host, list);

  if (unified.truncated) host.append(el('p', 'unified-note', COPY.narrow));
}

document.addEventListener('hoshilu:results-rendered', (event) => {
  const unified = event.detail?.unified_results;
  if (!unified) {
    const node = section();
    if (node) { node.hidden = true; node.replaceChildren(); }
    foldLegacySections(false);
    return;
  }
  render(unified, event.detail?.candidates || []);
});
