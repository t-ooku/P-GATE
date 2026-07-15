export function normalizePwaBase(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('PWA_URL_INVALID');
  if (url.search || url.hash) throw new Error('PWA_URL_INVALID');
  return `${url.origin}${url.pathname.replace(/\/+$/, '') || ''}`;
}

export function buildConsultUrl(base, query) {
  const normalizedBase = normalizePwaBase(base);
  const text = String(query || '').trim();
  if (text.length < 2 || text.length > 200) throw new Error('QUERY_LENGTH_INVALID');
  const url = new URL(normalizedBase);
  const fragment = new URLSearchParams({ q: text, source: 'chrome_extension' });
  url.hash = fragment.toString();
  return url.toString();
}
