const articleId = String(document.body?.dataset.seoArticleId || '').trim().slice(0, 64);
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

function send(event_type) {
  const body = JSON.stringify({
    event_type, locale, source: 'seo_article', medium: 'internal', content: articleId,
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
