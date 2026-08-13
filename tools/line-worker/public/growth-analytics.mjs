import { growthMarketplace } from './growth-marketplaces.mjs';

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
  source: params.get('utm_source') || (!hasUrlAttribution && seoContext ? 'seo_article' : ''),
  medium: params.get('utm_medium') || (!hasUrlAttribution && seoContext ? 'internal' : ''),
  campaign: params.get('utm_campaign') || params.get('campaign') || '',
  content: params.get('utm_content') || (!hasUrlAttribution && seoContext ? String(seoContext.article_id).slice(0, 64) : '')
};
window.HoshiluGrowthAttribution = Object.freeze({ ...attribution });
const locale = () => String(document.documentElement.lang || 'ja').split('-')[0].toUpperCase();
const randomId = () => crypto.randomUUID();
const readOrCreate = (key, fallback) => {
  try {
    const current = localStorage.getItem(key);
    if (/^[a-f0-9-]{20,64}$/i.test(current || '')) return current;
    const created = fallback(); localStorage.setItem(key, created); return created;
  } catch { return fallback(); }
};
const visitorId = readOrCreate('hoshilu_anonymous_visitor_id', randomId);
const sessionId = () => {
  try {
    const key = 'hoshilu_anonymous_session';
    const current = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (current?.id && Date.now() - Number(current.touched_at || 0) < 30 * 60 * 1000) {
      current.touched_at = Date.now(); sessionStorage.setItem(key, JSON.stringify(current)); return current.id;
    }
    const next = { id: randomId(), touched_at: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(next)); return next.id;
  } catch { return randomId(); }
};
const send = (event_type, extra = {}) => {
  const body = JSON.stringify({ event_type, locale: locale(), visitor_id: visitorId, session_id: sessionId(), ...attribution, ...extra });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
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

document.addEventListener('hoshilu:search-completed', () => send('search_completed'));
document.addEventListener('hoshilu:search-failed', () => send('search_failed'));
document.addEventListener('hoshilu:search-degraded', () => send('search_failed'));

document.addEventListener('click', event => {
  const target = event.target.closest('a,button');
  if (!target) return;
  if (target.classList.contains('wish-button')) send('wish_saved');
  if (target.classList.contains('price-compare-button') || target.classList.contains('ai-price-compare-button')) send('price_comparison_opened');
  if (target.classList.contains('share-discovery-button') || target.classList.contains('share-copy-button')) send('share_started');
  if ((target.classList.contains('buy-link') || target.classList.contains('offer-link')) && target.tagName === 'A') {
    const marketplace = growthMarketplace(target.dataset.marketplace, target.textContent);
    send(target.closest('.ranking-product-card') ? 'ranking_result_clicked' : 'ai_result_clicked', marketplace ? { marketplace } : {});
    if (marketplace) send('marketplace_click', { marketplace });
  }
});
