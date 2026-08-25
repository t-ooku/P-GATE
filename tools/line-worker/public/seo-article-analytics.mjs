import { growthSessionId, growthVisitorId } from './growth-identity.mjs';

const articleId = String(document.body?.dataset.seoArticleId || '').trim().slice(0, 64);
const searchIntent = String(document.body?.dataset.seoIntent || '').trim().slice(0, 80);
const contentKind = String(document.body?.dataset.seoContentKind || 'article').trim().toLowerCase().slice(0, 32);
const viewEvent = contentKind === 'hub' ? 'seo_hub_view' : 'seo_article_view';
const transitionEvent = contentKind === 'hub' ? 'seo_hub_search_transition' : 'seo_search_transition';
const locale = String(document.documentElement.lang || 'ja').split('-')[0].toUpperCase();
const visitorId = growthVisitorId();
const queryParams = new URLSearchParams(location.search);
const requestedSource = String(queryParams.get('utm_source') || '').trim().toLowerCase().slice(0, 64);
const requestedMedium = String(queryParams.get('utm_medium') || '').trim().toLowerCase().slice(0, 32);
const isQaVisit = requestedSource.startsWith('codex')
  || requestedSource.startsWith('test')
  || requestedSource.startsWith('qa')
  || requestedMedium === 'qa';
const eventSource = isQaVisit ? (requestedSource || 'qa') : (contentKind === 'hub' ? 'seo_hub' : 'seo_article');
const eventMedium = isQaVisit ? 'qa' : 'internal';

function send(event_type) {
  const body = JSON.stringify({
    event_type, locale, source: eventSource, medium: eventMedium, campaign: searchIntent, content: articleId,
    visitor_id: visitorId, session_id: growthSessionId()
  });
  if (typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' })) === true) return;
    } catch {}
  }
  fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

function preserveArticleContext(eventType = transitionEvent) {
  try {
    sessionStorage.setItem('hoshilu_seo_context', JSON.stringify({
      article_id: articleId, search_intent: searchIntent, content_kind: contentKind, created_at: Date.now()
    }));
  } catch {}
  send(eventType);
}

send(viewEvent);
document.querySelectorAll('[data-seo-search-form]').forEach((form) => form.addEventListener('submit', preserveArticleContext));
document.querySelectorAll('[data-seo-search-link]').forEach((link) => link.addEventListener('click', preserveArticleContext));
document.querySelectorAll('[data-seo-feature-link]').forEach((link) => link.addEventListener('click', () => preserveArticleContext('seo_feature_transition')));

if ('IntersectionObserver' in window) {
  const observedEvents = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
      const eventType = String(entry.target.dataset.seoSectionEvent || '');
      if (!eventType || observedEvents.has(eventType)) continue;
      observedEvents.add(eventType);
      send(eventType);
      observer.unobserve(entry.target);
    }
  }, { threshold: [0.5] });
  document.querySelectorAll('[data-seo-section-event]').forEach((section) => observer.observe(section));
}
