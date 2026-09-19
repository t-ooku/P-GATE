// 2026-09-19 大隆さん決定「トップの主役は値下がり待ち」。
// 第一画面の入力 → 既存の「すぐ検索」をそのまま実行 → 結果カードの
// 「この価格になったら教えて☑」を光らせて、そこから値段と通知先（LINE 1タップ／メール6桁）へ。
// 検索・ウォッチ・登録の処理は app.js のものを一切変えず、入口だけを1本にする。
// 計測: hero_price_watch_submitted（/api/events、検索文は送らない）。
const form = document.querySelector('#heroWatchForm');
const input = document.querySelector('#heroWatchQuery');
const query = document.querySelector('#query');
const knowledgeForm = document.querySelector('#knowledgeForm');
const results = document.querySelector('#resultsSection');
const cards = document.querySelector('#resultCards');
const INTENT_KEY = 'hoshilu_watch_intent';
const COPY = {
  JA: { banner: '気になる商品の「この価格になったら教えて☑」を押すと、値段を決められます。', empty: '何の値下がりを待つか入れてください。' },
  EN: { banner: 'Tap “Tell me at this price ✓” on a product to set your price.', empty: 'Type what you want to wait for.' },
  ZH: { banner: '点商品上的“到这个价格就提醒我☑”即可设定价格。', empty: '请输入想等降价的商品。' },
  KO: { banner: '상품의 “이 가격이 되면 알려줘☑”를 누르면 가격을 정할 수 있어요.', empty: '무엇의 가격 인하를 기다릴지 입력하세요.' }
};
function lang() { return document.querySelector('#languageSelect')?.value || 'JA'; }
function copy() { return COPY[lang()] || COPY.JA; }

function track(eventType) {
  try {
    // growth-analytics.mjs が公開する流入元と訪問者IDをそのまま使う（同じ visitor/session で数える）。
    const attribution = window.HoshiluGrowthAttribution || {};
    const identity = window.HoshiluGrowthIdentity;
    const body = JSON.stringify({ event_type: eventType, locale: lang(), visitor_id: identity?.visitorId?.() || '', session_id: identity?.sessionId?.() || '', ...attribution });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    else fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {}
}

function setIntent(on) { try { if (on) sessionStorage.setItem(INTENT_KEY, '1'); else sessionStorage.removeItem(INTENT_KEY); } catch {} }
function hasIntent() { try { return sessionStorage.getItem(INTENT_KEY) === '1'; } catch { return false; } }

let banner = null;
function showBanner() {
  if (!results || !hasIntent()) return;
  if (!results.querySelector('.watch-settings-button')) return;
  results.classList.add('watch-intent');
  if (!banner) {
    banner = document.createElement('p');
    banner.className = 'watch-intent-banner';
    banner.setAttribute('role', 'status');
  }
  banner.textContent = copy().banner;
  const message = document.querySelector('#resultMessage');
  if (message && banner.parentNode !== results) message.insertAdjacentElement('afterend', banner);
}
function clearIntent() {
  setIntent(false);
  results?.classList.remove('watch-intent');
  banner?.remove();
}

if (form && input && query && knowledgeForm) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) { input.setCustomValidity(copy().empty); input.reportValidity(); return; }
    input.setCustomValidity('');
    query.value = value;
    query.dispatchEvent(new Event('input', { bubbles: true }));
    setIntent(true);
    track('hero_price_watch_submitted');
    if (typeof knowledgeForm.requestSubmit === 'function') knowledgeForm.requestSubmit();
    else knowledgeForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    document.querySelector('#hoshiluSearch')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
}

if (cards) {
  new MutationObserver(() => showBanner()).observe(cards, { childList: true, subtree: true });
}
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('.watch-settings-button')) clearIntent();
});
document.addEventListener('hoshilu:search-failed', clearIntent);
