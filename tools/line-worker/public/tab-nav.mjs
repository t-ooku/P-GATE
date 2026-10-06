// 2026-09-16 大隆さん指示: Instagram / X のように、画面下部に固定のメニュー帯（5 タブ）を置き、
// ページを 5 つに整理する。開いたタブは上部の帯に「何のページか」を出す。
// 既存の節（section）は動かさず、タブごとに見せる節を切り替えるだけ（他モジュールの
// 取得・描画はそのまま動く）。ページ内リンク（#wishTitle 等）は、その節が属するタブを
// 自動で開いてからスクロールする。
const VIEWS = [
  { id: 'search', label: '探す', title: '探す', sub: 'メイン検索・ジャンル・人気の小ジャンル', icon: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.6 8.2 4.9 4.9-1.4 1.4-4.9-4.9 1.4-1.4Z' },
  // 2026-09-19 大隆さん指示: 「ホシる中」と「ショップ」の位置を交換（探す → ホシる中 → ショップ → セール → マイアカウント）。
  { id: 'hoshiru', label: 'ホシる中', title: 'ホシる中', sub: 'ホシってるもの・気になる商品', icon: 'M12 2.5l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.8 3.4 1.5-6.5-5-4.4 6.6-.6L12 2.5Z' },
  // 2026-10-06 大隆さん指示「今、ショップページに出店してるセラーいないからショップページは一旦非表示に。固定メニューから外そう」:
  // ITG 3店舗を非表示にして掲載ショップが 0 になったので、下部メニューから外す（hidden）。節は消さずに隠すだけ
  // （ショップ一覧・横断検索・クーポンの節はどのタブにも出ない）。出店が始まったら hidden を外せば戻る。旧 URL #tab-shops は探すへ。
  { id: 'shops', hidden: true, label: 'ショップ', title: 'ショップから探す', sub: '全ショップ横断検索・ショップ・クーポン', icon: 'M4 4h16l1 5a3 3 0 0 1-2.5 3V20H5.5v-8A3 3 0 0 1 3 9l1-5Zm3.5 10v4h3v-4h-3Zm5 0v4h3v-4h-3Z' },
  // 2026-09-20 大隆さん指示: 4番目は「ホシルバズ」→ 2026-10-03 大隆さん指示「ホシルバズのページ何もないなら削除」:
  // BUZZ は探すタブ（検索直下）へ移ったので、このタブは外す（4タブ）。みんなの値下がり待ちはホシる中へ。旧 URL #tab-buzz は探すへ。
  { id: 'account', label: 'マイアカウント', title: 'マイアカウント', sub: 'ログイン・お知らせ・セール通知の設定・公式アカウント', icon: 'M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 11c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5Z' }
];

// 節 → タブ。id かクラスで引く。ここに無い節は「探す」に残す。
const SECTION_VIEW = [
  ['#shopSearch', 'shops'], ['#shopDirectory', 'shops'], ['#shopCouponsNote', 'shops'],
  ['#insight', 'hoshiru'], ['#keptProducts', 'hoshiru'],
  // 2026-10-02 指示書「今ほしい人が買うためのサービス」§9・§10: BUZZ は検索のすぐ下（探すタブ）。みんなの値下がり待ちはホシルバズタブに残す。
  ['#buzzHome', 'search'], ['#watchDemand', 'hoshiru'],
  ['#accountPanel', 'account'], ['.sale-center', 'account'], ['#officialSocial', 'account'], ['#announcements', 'account']
];
// 2026-09-20 大隆さん指示: ホシる中は「ホシってるもの」が先。「気になる商品」はその中の
// 「値下がり待ち」の上に置く（ホシってるもの → 気になる商品 → 値下がり待ち → 追ってるキーワード）。
// 2026-10-03: みんなの値下がり待ちは「ホシってるもの」の後ろ（補助）。
const HOSHIRU_ORDER = ['#insight', '#watchDemand'];
// 「マイアカウント」の中の並び: ログイン → 受け取るセール → 公式アカウント → お知らせ
const ACCOUNT_ORDER = ['#accountPanel', '.sale-center', '#officialSocial', '#announcements'];
// 旧 URL（#tab-sale）は「マイアカウント」へ
const VIEW_ALIASES = { sale: 'account', buzz: 'search', shops: 'search' };

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
  const hoshiruHead = primary.querySelector(HOSHIRU_ORDER[0]);
  if (hoshiruHead) {
    // 先頭は #insight の位置（ホシる中の最初の節）に置き、以降を順に並べる。
    const insight = primary.querySelector('#insight');
    if (insight && insight !== hoshiruHead) insight.before(hoshiruHead);
    let cursor = hoshiruHead;
    for (const selector of HOSHIRU_ORDER.slice(1)) {
      const node = primary.querySelector(selector);
      if (node) { cursor.after(node); cursor = node; }
    }
  }
  // 2026-09-20 大隆さん指示: 「気になる商品」は「値下がり待ち」の上。ホシってるものの中へ入れ、
  // 入れ子のカードに見えないよう kept-in-insight を付ける（見た目は CSS 側で落とす）。
  const kept = primary.querySelector('#keptProducts');
  const entrusted = primary.querySelector('#entrustedWatches');
  if (kept && entrusted && kept.nextElementSibling !== entrusted) {
    entrusted.before(kept);
  }
  if (kept && entrusted) kept.classList.add('kept-in-insight');
  const account = primary.querySelector('#accountPanel');
  if (account) {
    let cursor = account;
    for (const selector of ACCOUNT_ORDER.slice(1)) {
      const node = primary.querySelector(selector);
      if (node) { cursor.after(node); cursor = node; }
    }
  }

  // 2026-09-17 大隆さん指示: 全ページともページ名の帯は出さない（各節の見出しがあるため）。上に詰める。

  const bar = document.createElement('nav');
  bar.className = 'tab-bar';
  bar.setAttribute('aria-label', 'メインメニュー');
  const visibleViews = VIEWS.filter((view) => !view.hidden);
  bar.style.gridTemplateColumns = `repeat(${visibleViews.length},minmax(0,1fr))`;
  // 検索欄の「ショップから探す」も、ショップを出していない間は出さない。
  if (VIEWS.some((view) => view.id === 'shops' && view.hidden)) document.querySelector('#shopSearchButton')?.classList.add('hidden');
  for (const view of visibleViews) {
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
    const view = VIEWS.find((item) => item.id === (VIEW_ALIASES[id] || id) && !item.hidden) || VIEWS[0];
    if (current === view.id) return view;
    current = view.id;
    for (const node of primary.children) node.classList.toggle('view-hidden', node.dataset.view !== view.id);
    for (const item of bar.querySelectorAll('.tab-bar-item')) {
      const active = item.dataset.view === view.id;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    }
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
    // 2026-10-03 大隆さん指示: 下部のボタンを押したら、そのページの一番上へ戻す。
    // 同じタブをもう一度押した時も（activate は何もしないので）ここで先頭へスクロールする。
    const view = activate(item.dataset.view);
    if (current === view.id) window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('hashchange', applyHash);
  window.addEventListener('popstate', applyHash);
  // 検索結果が出たら「探す」に戻す（他タブから検索を呼んだ時に結果が見えないままにならないように）。
  document.addEventListener('hoshilu:search-execution-started', () => activate('search', { scroll: false }));
  applyHash();
  window.HoshiluTabs = { activate, current: () => current };
}
