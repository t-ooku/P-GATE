import { growthMarketplace } from './growth-marketplaces.mjs';
import { growthSessionId, growthVisitorId } from './growth-identity.mjs';

const params = new URLSearchParams(location.search);
let seoContext = null;
try {
  const stored = JSON.parse(sessionStorage.getItem('hoshilu_seo_context') || 'null');
  if (stored?.article_id && Date.now() - Number(stored.created_at || 0) < 30 * 60 * 1000) seoContext = stored;
  else sessionStorage.removeItem('hoshilu_seo_context');
} catch {}
// params.has() ではなく実値で判定する。?utm_source= のように空値で付いてくる
// URLだと has() が真になり、UTMが実質無いのにSEO文脈のフォールバックまで
// 止まって、流入元が丸ごと不明になっていた。
const hasUrlAttribution = ['utm_source', 'utm_medium', 'utm_campaign', 'campaign', 'utm_content']
  .some((name) => String(params.get(name) || '').trim() !== '');
const urlAttribution = {
  source: params.get('utm_source') || (!hasUrlAttribution && seoContext ? `seo_${seoContext.content_kind === 'hub' ? 'hub' : 'article'}` : ''),
  medium: params.get('utm_medium') || (!hasUrlAttribution && seoContext ? 'internal' : ''),
  campaign: params.get('utm_campaign') || params.get('campaign') || (!hasUrlAttribution && seoContext ? String(seoContext.search_intent || '').slice(0, 80) : ''),
  content: params.get('utm_content') || (!hasUrlAttribution && seoContext ? String(seoContext.article_id).slice(0, 64) : '')
};

// 流入元はセッションが続く限り引き継ぐ。
//
// これが無かったため、UTM付きで着地しても2ページ目以降のイベントは
// source='' になっていた。セッションIDは growth-identity.mjs が30分の
// スライディングTTLで維持するので、リロード・戻る・/privacy等への遷移・
// インストール済みPWAの再起動(start_urlにUTMは付かない)のたびに、同じ
// セッションの残りのイベントが「直接・不明」へ落ちる。
// 特に socialPromotionSummary はセッションではなく生イベントを数えるので、
// X/Instagramのファネルは初回ページ以降が丸ごと欠測していた。
//
// 内部SEO文脈(hoshilu_seo_context)は既にこの方式で引き継がれており、
// 外部からのUTMだけが引き継がれていなかった。この非対称は意図した設計
// ではなく実装漏れと判断して揃える。
//
// 個人を特定する情報は入れない(UTMの4項目のみ)。sessionStorageなので
// タブを閉じれば消える。
const ATTRIBUTION_KEY = 'hoshilu_growth_attribution';
const ATTRIBUTION_TTL_MS = 30 * 60 * 1000;
function storedAttribution() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || 'null');
    if (!stored || Date.now() - Number(stored.created_at || 0) >= ATTRIBUTION_TTL_MS) return null;
    if (!stored.source && !stored.medium && !stored.campaign && !stored.content) return null;
    return {
      source: String(stored.source || ''), medium: String(stored.medium || ''),
      campaign: String(stored.campaign || ''), content: String(stored.content || '')
    };
  } catch { return null; }
}
const hasUrlValue = Boolean(urlAttribution.source || urlAttribution.medium
  || urlAttribution.campaign || urlAttribution.content);
// 新しいUTMで着地したなら、そちらが最新の流入元。保存済みより優先する。
const attribution = hasUrlValue ? urlAttribution : (storedAttribution() || urlAttribution);
if (hasUrlValue) {
  try {
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...attribution, created_at: Date.now() }));
  } catch {}
}
window.HoshiluGrowthAttribution = Object.freeze({ ...attribution });
const locale = () => String(document.documentElement.lang || 'ja').split('-')[0].toUpperCase();
const visitorId = growthVisitorId();
const send = (event_type, extra = {}) => {
  const body = JSON.stringify({ event_type, locale: locale(), visitor_id: visitorId, session_id: growthSessionId(), ...attribution, ...extra });
  if (typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' })) === true) return;
    } catch {}
  }
  fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
};
const SEARCH_WATCHDOG_MS = 75000;
const searchWatches = new Map();
// One enum event is emitted per accepted search execution. The enum contains
// presence flags only; the query, URL and image never enter analytics.
const SEARCH_INPUT_EVENT = Object.freeze({
  TEXT: 'search_input_text',
  SCREENSHOT: 'search_input_screenshot',
  SOCIAL_URL: 'search_input_social_url',
  TEXT_SCREENSHOT: 'search_input_text_screenshot',
  TEXT_SOCIAL_URL: 'search_input_text_social_url',
  SCREENSHOT_SOCIAL_URL: 'search_input_screenshot_social_url',
  TEXT_SCREENSHOT_SOCIAL_URL: 'search_input_text_screenshot_social_url'
});
const SEARCH_COMPLETED_INPUT_EVENT = Object.freeze({
  TEXT: 'search_completed_text', SCREENSHOT: 'search_completed_screenshot',
  SOCIAL_URL: 'search_completed_social_url', TEXT_SCREENSHOT: 'search_completed_text_screenshot',
  TEXT_SOCIAL_URL: 'search_completed_text_social_url',
  SCREENSHOT_SOCIAL_URL: 'search_completed_screenshot_social_url',
  TEXT_SCREENSHOT_SOCIAL_URL: 'search_completed_text_screenshot_social_url'
});
const SEARCH_OUTBOUND_INPUT_EVENT = Object.freeze({
  TEXT: 'search_outbound_text', SCREENSHOT: 'search_outbound_screenshot',
  SOCIAL_URL: 'search_outbound_social_url', TEXT_SCREENSHOT: 'search_outbound_text_screenshot',
  TEXT_SOCIAL_URL: 'search_outbound_text_social_url',
  SCREENSHOT_SOCIAL_URL: 'search_outbound_screenshot_social_url',
  TEXT_SCREENSHOT_SOCIAL_URL: 'search_outbound_text_screenshot_social_url'
});
let lastCompletedSearch = null;
const clearSearchWatch = executionId => {
  const watch = searchWatches.get(String(executionId || ''));
  if (!watch) return;
  clearTimeout(watch.timer);
  searchWatches.delete(String(executionId));
  return watch;
};
const startSearchWatch = event => {
  const executionId = String(event.detail?.executionId || '');
  if (!/^[a-f0-9-]{20,64}$/iu.test(executionId)) return;
  const inputType = String(event.detail?.inputType || '');
  const inputEvent = SEARCH_INPUT_EVENT[inputType];
  if (inputEvent) send(inputEvent, { execution_id: executionId });
  clearSearchWatch(executionId);
  lastCompletedSearch = inputEvent ? { executionId, inputType, outboundSent: false } : null;
  const watch = { inputType: inputEvent ? inputType : '', timer: 0 };
  watch.timer = setTimeout(() => {
    if (searchWatches.get(executionId) !== watch) return;
    searchWatches.delete(executionId);
    // No query text or exception body is sent. A timeout means the real
    // result/degraded terminal events never arrived for this execution.
    send('search_dead_end');
  }, SEARCH_WATCHDOG_MS);
  searchWatches.set(executionId, watch);
};
const completeSearchWatch = event => {
  const executionId = String(event.detail?.executionId || '');
  const watch = clearSearchWatch(executionId);
  const completedEvent = SEARCH_COMPLETED_INPUT_EVENT[watch?.inputType];
  if (completedEvent) {
    send(completedEvent, { execution_id: executionId });
    if (!lastCompletedSearch || lastCompletedSearch.executionId !== executionId) {
      lastCompletedSearch = { executionId, inputType: watch.inputType, outboundSent: false };
    }
  }
  send('search_completed');
};

send('landing_view');
try {
  const visitKey = 'hoshilu_last_visit_at';
  const previous = Number(localStorage.getItem(visitKey) || 0);
  const now = Date.now();
  if (previous > 0 && now - previous >= 30 * 60 * 1000) send('returning_visit');
  localStorage.setItem(visitKey, String(now));
} catch {}

document.addEventListener('submit', event => {
  if (event.target?.id === 'knowledgeForm') send('search_started');
});

// search_started is emitted only after the browser accepts a submit. Keep a
// separate attempt signal so malformed optional URL input and any future
// native validation can be distinguished from a user who never pressed the
// button. Capture runs before native validation and never includes input data.
document.addEventListener('click', event => {
  const target = event.target?.closest?.('#submitButton, button[type=submit]');
  if (target && target.form?.id === 'knowledgeForm') send('search_attempted');
}, true);

// 検証で止められたことを記録する。invalid はバブリングしないので capture で拾う。
// どのフィールドで止まったかは送らない: extraで content 等を渡すと流入元の
// 項目を上書きしてしまい、traffic_class が ATTRIBUTED に化けて流入元計測を
// 汚す。検索文も従来どおり一切送らない。
document.addEventListener('invalid', event => {
  if (event.target?.form?.id === 'knowledgeForm') send('search_blocked');
}, true);

document.addEventListener('hoshilu:search-execution-started', startSearchWatch);
document.addEventListener('hoshilu:search-cancelled', event => clearSearchWatch(event.detail?.executionId));
document.addEventListener('hoshilu:search-completed', completeSearchWatch);
document.addEventListener('hoshilu:search-failed', event => { clearSearchWatch(event.detail?.executionId); send('search_dead_end'); });
document.addEventListener('hoshilu:search-degraded', event => {
  clearSearchWatch(event.detail?.executionId);
  // Attribution is preserved. Only an allowlisted code and UUID-shaped
  // request ID accompany the event; query text and exception bodies do not.
  send('search_degraded', {
    failure_code: event.detail?.errorCode,
    request_id: event.detail?.requestId
  });
});
document.addEventListener('hoshilu:wish-saved', () => send('wish_saved'));

document.addEventListener('click', event => {
  const target = event.target.closest('a,button');
  if (!target) return;
  if (target.classList.contains('price-compare-button') || target.classList.contains('ai-price-compare-button')) send('price_comparison_opened');
  if (target.classList.contains('share-discovery-button') || target.classList.contains('share-copy-button')
    || target.classList.contains('share-gmail-button') || target.classList.contains('social-target')
    || target.dataset.channel === 'line') send('share_started');
  if (target.matches('.buy-link,.offer-link,.price-offer,.product-primary-link,.price-compare-link,.price-compare-search-link') && target.tagName === 'A') {
    // LINE is a share handoff, not a product-result click. It was previously
    // misclassified as ai_result_clicked because it reuses the buy-link style.
    if (target.dataset.channel === 'line') return;
    const marketplace = growthMarketplace(target.dataset.marketplace, target.textContent);
    send(target.closest('.ranking-product-card') ? 'ranking_result_clicked' : 'ai_result_clicked', marketplace ? { marketplace } : {});
    if (marketplace) {
      send('marketplace_click', { marketplace });
      // Count one conversion per completed search, not every shop click.
      if (!target.closest('.ranking-product-card') && lastCompletedSearch && !lastCompletedSearch.outboundSent) {
        const outboundEvent = SEARCH_OUTBOUND_INPUT_EVENT[lastCompletedSearch.inputType];
        if (outboundEvent) {
          send(outboundEvent, { execution_id: lastCompletedSearch.executionId });
          lastCompletedSearch.outboundSent = true;
        }
      }
      if (target.dataset.measurementContext === 'BROWSER_EMERGENCY_FALLBACK') {
        send('marketplace_fallback_click', { marketplace, medium: 'fallback', campaign: 'browser_emergency' });
      }
    }
  }
});
