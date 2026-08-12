const articleId = String(document.body?.dataset.seoArticleId || '').trim().slice(0, 64);
const searchIntent = String(document.body?.dataset.seoIntent || '').trim().slice(0, 80);
const locale = String(document.documentElement.lang || 'ja').split('-')[0].toUpperCase();
const randomId = () => crypto.randomUUID();
const readOrCreate = (key, storage) => {
  try {
    const current = storage.getItem(key);
    if (/^[a-f0-9-]{20,64}$/i.test(current || '')) return current;
    const created = randomId(); storage.setItem(key, created); return created;
  } catch { return randomId(); }
};
const visitorId = readOrCreate('hoshilu_anonymous_visitor_id', localStorage);
const sessionId = readOrCreate('hoshilu_seo_session_id', sessionStorage);
const queryParams = new URLSearchParams(location.search);
const requestedSource = String(queryParams.get('utm_source') || '').trim().toLowerCase().slice(0, 64);
const requestedMedium = String(queryParams.get('utm_medium') || '').trim().toLowerCase().slice(0, 32);
const isQaVisit = requestedSource.startsWith('codex')
  || requestedSource.startsWith('test')
  || requestedSource.startsWith('qa')
  || requestedMedium === 'qa';
const eventSource = isQaVisit ? (requestedSource || 'qa') : 'seo_article';
const eventMedium = isQaVisit ? 'qa' : 'internal';

function send(event_type) {
  const body = JSON.stringify({
    event_type, locale, source: eventSource, medium: eventMedium, campaign: searchIntent, content: articleId,
    visitor_id: visitorId, session_id: sessionId
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

function preserveArticleContext() {
  try {
    sessionStorage.setItem('hoshilu_seo_context', JSON.stringify({ article_id: articleId, created_at: Date.now() }));
  } catch {}
  send('seo_search_transition');
}

send('seo_article_view');
document.querySelectorAll('[data-seo-search-form]').forEach((form) => form.addEventListener('submit', preserveArticleContext));
document.querySelectorAll('[data-seo-search-link]').forEach((link) => link.addEventListener('click', preserveArticleContext));

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
