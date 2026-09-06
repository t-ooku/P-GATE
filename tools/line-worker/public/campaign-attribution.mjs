const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function campaignContext(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const clean = (name) => {
    const value = String(params.get(name) || '').trim();
    return SAFE_ID.test(value) ? value : '';
  };
  return {
    query: String(params.get('q') || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 200),
    campaign: clean('campaign') || clean('utm_campaign'),
    source: clean('utm_source'),
    medium: clean('utm_medium'),
    content: clean('utm_content')
  };
}

export function buildCampaignUrl(base, input = {}) {
  const url = new URL(base);
  const values = {
    q: String(input.query || '').trim().slice(0, 200),
    campaign: String(input.campaign || '').trim(),
    utm_source: String(input.source || '').trim(),
    utm_medium: String(input.medium || 'social').trim(),
    utm_content: String(input.content || '').trim()
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value && (key === 'q' || SAFE_ID.test(value))) url.searchParams.set(key, value);
  });
  return url.toString();
}
