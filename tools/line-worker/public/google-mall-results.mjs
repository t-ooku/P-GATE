// 2026-09-20 GPT 指示書 §12〜§18（大隆さん承認）: 楽天・Yahoo! 以外のモールで HOSHILU の結果が無いものは、
// 公式 Google Agent Search の結果を「Web検索から発見」として横スライド（カルーセル）で出す。
// app.js が renderResults の先頭で投げる hoshilu:results-rendered の detail.google_mall_results を描くだけ。
// 価格は「参考価格・検索時点」と明記し、API 確認価格とは区別する（§19）。
const COPY = {
  JA: { kicker: 'WEB検索から発見', title: 'web検索から発見', note: 'Google 検索（Amazon・Qoo10・SHEIN・ZOZOTOWN など）の結果です。価格は各ページに書かれていた参考価格（検索時点）で、HOSHILU が API で確認した価格ではありません。', price: '参考価格・検索時点', open: '商品を見る', openListing: '一覧を見る', listing: '一覧ページ', prev: '前へ', next: '次へ' },
  EN: { kicker: 'FOUND VIA WEB SEARCH', title: 'Found via Google Search', note: 'Google Search results (Amazon, Qoo10, SHEIN, ZOZOTOWN, etc.). Prices are as listed on each page at search time, not API-verified prices.', price: 'Listed price at search time', open: 'View', openListing: 'View listing', listing: 'Listing page', prev: 'Previous', next: 'Next' },
  ZH: { kicker: '网页搜索结果', title: 'Google 搜索结果', note: 'Google 搜索结果。价格为页面当时标注的参考价，不是 HOSHILU 通过 API 确认的价格。', price: '参考价・搜索时点', open: '查看', openListing: '查看列表', listing: '列表页', prev: '上一页', next: '下一页' },
  KO: { kicker: '웹 검색 결과', title: 'Google 검색 결과', note: 'Google 검색 결과입니다. 가격은 각 페이지에 표시된 참고 가격(검색 시점)이며 API 확인 가격이 아닙니다.', price: '참고 가격・검색 시점', open: '보기', openListing: '목록 보기', listing: '목록 페이지', prev: '이전', next: '다음' }
};
const lang = () => document.querySelector('#languageSelect')?.value || 'JA';
const copy = () => COPY[lang()] || COPY.JA;
const results = document.querySelector('#resultsSection');
const cards = document.querySelector('#resultCards');
let section = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ensureSection() {
  if (section) return section;
  section = el('section', 'google-mall-results hidden');
  section.id = 'googleMallResults';
  section.setAttribute('aria-labelledby', 'googleMallResultsTitle');
  cards?.insertAdjacentElement('afterend', section);
  return section;
}

function clear() {
  section?.replaceChildren();
  section?.classList.add('hidden');
}

function card(item, c) {
  const article = el('article', 'google-mall-card');
  article.setAttribute('role', 'listitem');
  const link = el('a', 'google-mall-card-link');
  link.href = item.tracking_url || item.product_url; link.target = '_blank'; link.rel = 'nofollow sponsored noopener';
  const figure = el('div', 'google-mall-card-image');
  const fallback = () => figure.replaceChildren(el('span', 'google-mall-card-image-fallback', item.mall_label || ''));
  if (item.image_url) {
    const img = document.createElement('img');
    img.src = item.image_url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
    img.addEventListener('error', fallback);
    figure.append(img);
  } else {
    fallback();
  }
  const body = el('div', 'google-mall-card-body');
  body.append(el('span', 'google-mall-card-mall', item.mall_label || item.marketplace || ''));
  body.append(el('strong', 'google-mall-card-title', item.title || ''));
  if (Number(item.listed_price_jpy) > 0) {
    body.append(el('span', 'google-mall-card-price', `¥${Number(item.listed_price_jpy).toLocaleString('ja-JP')}`));
    body.append(el('small', 'google-mall-card-price-note', c.price));
  }
  // 2026-09-21 大隆さん報告（Amazon のカテゴリページが商品カードとして出ていた）:
  // 件数は減らさず残すが、遷移先が商品ページでないものは「一覧ページ」と明示し、
  // 「商品を見る」とは書かない。表示と実際の遷移先を一致させる（正確な送客を優先）。
  const isProduct = item.product_page === true;
  if (!isProduct) body.append(el('span', 'google-mall-card-kind', c.listing));
  body.append(el('span', 'google-mall-card-open', `${isProduct ? c.open : c.openListing} →`));
  link.append(figure, body);
  article.append(link);
  if(item.product_page===true){
    const save=el('div','google-mall-card-save');
    article.append(save);
    document.dispatchEvent(new CustomEvent('hoshilu:google-mall-save-control',{detail:{item,container:save}}));
  }
  return article;
}

function render(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!results || !cards) return;
  const root = ensureSection();
  if (!items.length) { clear(); return; }
  const c = copy();
  root.replaceChildren();
  const heading = el('div', 'google-mall-results-heading');
  // 2026-09-20 大隆さん指示: 見出しは1行だけ（注記は各カードの「参考価格・検索時点」に集約）。
  // 2026-09-21 大隆さん指示: 見出しは「web検索から発見」。
  const title = el('h2', '', c.title); title.id = 'googleMallResultsTitle';
  heading.append(title);
  // 横スライド（Google のショッピング枠と同じ）: スマホは指でスワイプ、PC は左右ボタン。scroll-snap で止まる。
  const slider = el('div', 'google-mall-slider');
  const track = el('div', 'google-mall-track');
  track.setAttribute('role', 'list');
  for (const item of items) track.append(card(item, c));
  const prev = el('button', 'google-mall-arrow google-mall-arrow-prev', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', c.prev);
  const next = el('button', 'google-mall-arrow google-mall-arrow-next', '›'); next.type = 'button'; next.setAttribute('aria-label', c.next);
  const step = () => Math.max(160, Math.floor(track.clientWidth * 0.8));
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  const syncArrows = () => {
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };
  track.addEventListener('scroll', syncArrows, { passive: true });
  slider.append(prev, track, next);
  root.append(heading, slider);
  root.classList.remove('hidden');
  requestAnimationFrame(syncArrows);
}

document.addEventListener('hoshilu:search-execution-started', clear);
document.addEventListener('hoshilu:results-rendered', (event) => render(event.detail?.google_mall_results));
