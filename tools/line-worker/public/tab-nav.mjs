// 2026-09-16 大隆さん指示: Instagram / X のように、画面下部に固定のメニュー帯（5 タブ）を置き、
// ページを 5 つに整理する。開いたタブは上部の帯に「何のページか」を出す。
// 既存の節（section）は動かさず、タブごとに見せる節を切り替えるだけ（他モジュールの
// 取得・描画はそのまま動く）。ページ内リンク（#wishTitle 等）は、その節が属するタブを
// 自動で開いてからスクロールする。
const VIEWS = [
  { id: 'search', label: '探す', title: '探す', sub: 'メイン検索・ジャンル・人気の小ジャンル', icon: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.6 8.2 4.9 4.9-1.4 1.4-4.9-4.9 1.4-1.4Z' },
  { id: 'shops', label: 'ショップ', title: 'ショップから探す', sub: 'ショップ・クーポン', icon: 'M4 4h16l1 5a3 3 0 0 1-2.5 3V20H5.5v-8A3 3 0 0 1 3 9l1-5Zm3.5 10v4h3v-4h-3Zm5 0v4h3v-4h-3Z' },
  { id: 'hoshiru', label: 'ホシる中', title: 'ホシる中', sub: 'ホシってるもの・気になる商品・今みんながホシってる', icon: 'M12 2.5l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.8 3.4 1.5-6.5-5-4.4 6.6-.6L12 2.5Z' },
  { id: 'sale', label: 'セール', title: 'ホシル セールレーダー', sub: '受け取るモールのセールだけ通知', icon: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 2.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z' },
  { id: 'account', label: 'マイアカウント', title: 'マイアカウント', sub: 'ログイン・お知らせ・公式アカウント', icon: 'M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 11c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5Z' }
];

// 節 → タブ。id かクラスで引く。ここに無い節は「探す」に残す。
const SECTION_VIEW = [
  ['#shopDirectory', 'shops'], ['#shopCouponsNote', 'shops'],
  ['#insight', 'hoshiru'], ['#keptProducts', 'hoshiru'], ['#buzzHome', 'hoshiru'], ['#watchDemand', 'hoshiru'],
  ['.sale-center', 'sale'],
  ['#accountPanel', 'account'], ['#officialSocial', 'account'], ['#announcements', 'account']
];
// 「ホシる中」の中の並び: ホシってるもの → 値下がり待ち（insight 内）→ 今みんながホシってる → みんなが値下がりを待ってる
const HOSHIRU_ORDER = ['#insight', '#keptProducts', '#buzzHome', '#watchDemand'];

const main = document.querySelector('#top');
const primary = document.querySelector('.hoshilu-primary');
if (main && primary) {
  const sections = [...primary.children];
  for (const node of sections) {
    let view = 'search';
    for (const [selector, target] of SECTION_VIEW) {
      if (node.matches(selector)) { view = target; break; }
    }
    node.dataset.view = view;
  }
  const insight = primary.querySelector('#insight');
  if (insight) {
    let cursor = insight;
    for (const selector of HOSHIRU_ORDER.slice(1)) {
      const node = primary.querySelector(selector);
      if (node) { cursor.after(node); cursor = node; }
    }
  }

  const titleBar = document.createElement('div');
  titleBar.id = 'viewTitle';
  titleBar.className = 'view-title';
  titleBar.setAttribute('aria-live', 'polite');
  main.prepend(titleBar);

  const bar = document.createElement('nav');
  bar.className = 'tab-bar';
  bar.setAttribute('aria-label', 'メインメニュー');
  for (const view of VIEWS) {
    const button = document.createElement('a');
    button.className = 'tab-bar-item';
    button.href = `#tab-${view.id}`;
    button.dataset.view = view.id;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${view.icon}"/></svg><span>${view.label}</span>`;
    bar.append(button);
  }
  document.body.append(bar);
  document.body.classList.add('has-tab-bar');

  let current = '';
  function activate(id, { scroll = true } = {}) {
    const view = VIEWS.find((item) => item.id === id) || VIEWS[0];
    if (current === view.id) return view;
    current = view.id;
    for (const node of primary.children) node.classList.toggle('view-hidden', node.dataset.view !== view.id);
    for (const item of bar.querySelectorAll('.tab-bar-item')) {
      const active = item.dataset.view === view.id;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    }
    titleBar.replaceChildren();
    // 2026-09-17 大隆さん指示: 「探す」ページの帯からページ名を消す（h1「探さなくていい。ホシっといて。」が見出しになる）。
    titleBar.classList.toggle('view-title-hidden', view.id === 'search');
    const heading = document.createElement('strong');
    heading.textContent = view.title;
    const sub = document.createElement('span');
    sub.textContent = view.sub;
    titleBar.append(heading, sub);
    document.body.dataset.view = view.id;
    document.dispatchEvent(new CustomEvent('hoshilu:view-changed', { detail: { view: view.id } }));
    if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
    return view;
  }

  function viewForHash(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    if (!raw) return null;
    const tab = raw.match(/^tab-([a-z]+)$/);
    if (tab) return { view: tab[1], target: null };
    let target = null;
    try { target = document.getElementById(decodeURIComponent(raw)); } catch { target = null; }
    if (!target) return null;
    const section = target.closest('[data-view]');
    return { view: section?.dataset.view || 'search', target };
  }

  function applyHash() {
    const resolved = viewForHash(location.hash);
    if (!resolved) { activate('search', { scroll: false }); return; }
    activate(resolved.view, { scroll: !resolved.target });
    if (resolved.target) window.setTimeout(() => resolved.target.scrollIntoView({ block: 'start' }), 0);
  }

  bar.addEventListener('click', (event) => {
    const item = event.target.closest('.tab-bar-item');
    if (!item) return;
    event.preventDefault();
    if (location.hash !== `#tab-${item.dataset.view}`) history.pushState(null, '', `#tab-${item.dataset.view}`);
    activate(item.dataset.view);
  });
  window.addEventListener('hashchange', applyHash);
  window.addEventListener('popstate', applyHash);
  // 検索結果が出たら「探す」に戻す（他タブから検索を呼んだ時に結果が見えないままにならないように）。
  document.addEventListener('hoshilu:search-execution-started', () => activate('search', { scroll: false }));
  applyHash();
  window.HoshiluTabs = { activate, current: () => current };
}
