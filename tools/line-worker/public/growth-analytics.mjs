import { growthMarketplace } from './growth-marketplaces.mjs';
import { growthSessionId, growthVisitorId } from './growth-identity.mjs';

const params = new URLSearchParams(location.search);
let seoContext = null;
try {
  const stored = JSON.parse(sessionStorage.getItem('hoshilu_seo_context') || 'null');
  if (stored?.article_id && Date.now() - Number(stored.created_at || 0) < 30 * 60 * 1000) seoContext = stored;
  else sessionStorage.removeItem('hoshilu_seo_context');
} catch {}
const hasUrlAttribution = ['utm_source', 'utm_medium', 'utm_campaign', 'campaign', 'utm_content']
  .some((name) => params.has(name));
const attribution = {
  source: params.get('utm_source') || (!hasUrlAttribution && seoContext ? `seo_${seoContext.content_kind === 'hub' ? 'hub' : 'article'}` : ''),
  medium: params.get('utm_medium') || (!hasUrlAttribution && seoContext ? 'internal' : ''),
  campaign: params.get('utm_campaign') || params.get('campaign') || (!hasUrlAttribution && seoContext ? String(seoContext.search_intent || '').slice(0, 80) : ''),
  content: params.get('utm_content') || (!hasUrlAttribution && seoContext ? String(seoContext.article_id).slice(0, 64) : '')
};
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
const clearSearchWatch = executionId => {
  const watch = searchWatches.get(String(executionId || ''));
  if (!watch) return;
  clearTimeout(watch);
  searchWatches.delete(String(executionId));
};
const startSearchWatch = event => {
  const executionId = String(event.detail?.executionId || '');
  if (!/^[a-f0-9-]{20,64}$/iu.test(executionId)) return;
  clearSearchWatch(executionId);
  const watch = setTimeout(() => {
    if (searchWatches.get(executionId) !== watch) return;
    searchWatches.delete(executionId);
    // No query text or exception body is sent. A timeout means the real
    // result/degraded terminal events never arrived for this execution.
    send('search_dead_end');
  }, SEARCH_WATCHDOG_MS);
  searchWatches.set(executionId, watch);
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

document.addEventListener('hoshilu:search-execution-started', startSearchWatch);
document.addEventListener('hoshilu:search-cancelled', event => clearSearchWatch(event.detail?.executionId));
document.addEventListener('hoshilu:search-completed', event => { clearSearchWatch(event.detail?.executionId); send('search_completed'); });
document.addEventListener('hoshilu:search-failed', event => { clearSearchWatch(event.detail?.executionId); send('search_dead_end'); });
document.addEventListener('hoshilu:search-degraded', event => {
  clearSearchWatch(event.detail?.executionId);
  // Attribution is preserved. The search text, request ID and exception
  // message never enter the public analytics event.
  send('search_degraded');
});

document.addEventListener('click', event => {
  const target = event.target.closest('a,button');
  if (!target) return;
  if (target.classList.contains('wish-button')) send('wish_saved');
  if (target.classList.contains('price-compare-button') || target.classList.contains('ai-price-compare-button')) send('price_comparison_opened');
  if (target.classList.contains('share-discovery-button') || target.classList.contains('share-copy-button')) send('share_started');
  if (target.matches('.buy-link,.offer-link,.price-offer,.product-primary-link,.price-compare-link,.price-compare-search-link') && target.tagName === 'A') {
    const marketplace = growthMarketplace(target.dataset.marketplace, target.textContent);
    send(target.closest('.ranking-product-card') ? 'ranking_result_clicked' : 'ai_result_clicked', marketplace ? { marketplace } : {});
    if (marketplace) {
      send('marketplace_click', { marketplace });
      if (target.dataset.measurementContext === 'BROWSER_EMERGENCY_FALLBACK') {
        send('marketplace_fallback_click', { marketplace, medium: 'fallback', campaign: 'browser_emergency' });
      }
    }
  }
});
