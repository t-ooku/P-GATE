// 2026-09-19 大隆さん指示「探してる最中がわかりづらい。目立つ時計マークを表示して」。
// 検索中は画面上部に大きな時計（針が回る）と「探しています…」を固定表示する。
// 判定は app.js が出す既存イベント（search-execution-started / knowledge-started → 開始、
// completed / cancelled / degraded → 終了）と #resultCards の aria-busy の両方を見る。
// 90 秒で必ず消す（万一イベントが来なくても画面を塞がない）。検索処理には触らない。
const COPY = {
  JA: { title: '探しています…', sub: 'Amazon・楽天・Yahoo!など最大13モールを確認中', sec: '秒' },
  EN: { title: 'Searching…', sub: 'Checking up to 13 marketplaces', sec: 's' },
  ZH: { title: '正在搜索…', sub: '正在确认最多13个商城', sec: '秒' },
  KO: { title: '찾고 있어요…', sub: '최대 13개 쇼핑몰 확인 중', sec: '초' }
};
const lang = () => document.querySelector('#languageSelect')?.value || 'JA';
const copy = () => COPY[lang()] || COPY.JA;
const SAFETY_MS = 90000;

let node = null; let timer = null; let ticker = null; let startedAt = 0; let active = false;

function build() {
  node = document.createElement('div');
  node.id = 'searchProgress';
  node.className = 'search-progress hidden';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.innerHTML = `
    <svg class="search-progress-clock" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" class="search-progress-face"/>
      <circle cx="32" cy="32" r="28" class="search-progress-ring"/>
      <line x1="32" y1="32" x2="32" y2="16" class="search-progress-hand search-progress-hand-min"/>
      <line x1="32" y1="32" x2="42" y2="32" class="search-progress-hand search-progress-hand-hour"/>
      <circle cx="32" cy="32" r="2.5" class="search-progress-center"/>
    </svg>
    <div class="search-progress-text">
      <strong class="search-progress-title"></strong>
      <span class="search-progress-sub"></span>
      <span class="search-progress-elapsed"></span>
    </div>`;
  document.body.append(node);
}

function show() {
  if (!node) build();
  const c = copy();
  node.querySelector('.search-progress-title').textContent = c.title;
  node.querySelector('.search-progress-sub').textContent = c.sub;
  if (!active) {
    active = true; startedAt = Date.now();
    node.querySelector('.search-progress-elapsed').textContent = '';
    clearInterval(ticker);
    ticker = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      node.querySelector('.search-progress-elapsed').textContent = s >= 3 ? `${s}${copy().sec}` : '';
    }, 1000);
  }
  node.classList.remove('hidden');
  document.documentElement.classList.add('hoshilu-searching');
  clearTimeout(timer);
  timer = setTimeout(hide, SAFETY_MS);
}

function hide() {
  active = false;
  clearTimeout(timer); clearInterval(ticker);
  node?.classList.add('hidden');
  document.documentElement.classList.remove('hoshilu-searching');
}

for (const type of ['hoshilu:search-execution-started', 'hoshilu:search-knowledge-started']) document.addEventListener(type, show);
for (const type of ['hoshilu:search-completed', 'hoshilu:search-cancelled', 'hoshilu:search-degraded', 'hoshilu:search-failed']) document.addEventListener(type, hide);

const cards = document.querySelector('#resultCards');
if (cards) {
  new MutationObserver(() => {
    if (cards.getAttribute('aria-busy') === 'true') show(); else hide();
  }).observe(cards, { attributes: true, attributeFilter: ['aria-busy'] });
}
