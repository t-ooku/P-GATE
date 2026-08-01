const params = new URLSearchParams(location.search);
const ATTRIBUTION_KEY = 'hoshilu_growth_attribution_v1';
const VISIT_KEY = 'hoshilu_growth_last_visit_v1';
const pageContentCandidate = String(document.body?.dataset?.growthContent || '');
const pageContent = /^[a-z0-9_]{1,64}$/.test(pageContentCandidate) ? pageContentCandidate : '';
const freshAttribution = {
  source: params.get('utm_source') || '',
  medium: params.get('utm_medium') || '',
  campaign: params.get('utm_campaign') || params.get('campaign') || '',
  content: params.get('utm_content') || pageContent
};
const hasFreshAttribution = Object.values(freshAttribution).some(Boolean);
let storedAttribution = {};
try { storedAttribution = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || '{}'); } catch {}
const attribution = hasFreshAttribution ? freshAttribution : {
  source: storedAttribution.source || '', medium: storedAttribution.medium || '',
  campaign: storedAttribution.campaign || '', content: storedAttribution.content || ''
};
if (hasFreshAttribution) {
  try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(freshAttribution)); } catch {}
}
window.HoshiluGrowthAttribution = Object.freeze({ ...attribution });
const locale = () => String(document.documentElement.lang || 'ja').split('-')[0].toUpperCase();
const send = (event_type, extra = {}) => {
  const experiment = window.HoshiluGrowthExperiment || {};
  const body = JSON.stringify({ event_type, locale: locale(), ...attribution, ...experiment, ...extra });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
};
window.HoshiluTrackGrowth = send;

const landingContent = pageContent || (attribution.content.startsWith('seo_') ? '' : attribution.content);
send('landing_view', { content: landingContent });
try {
  const previous = Number(localStorage.getItem(VISIT_KEY) || 0);
  const now = Date.now();
  if (previous && now - previous >= 30 * 60 * 1000) send('return_visit');
  localStorage.setItem(VISIT_KEY, String(now));
} catch {}

document.addEventListener('submit', event => {
  if (event.target?.matches?.('[data-growth-cta]')) send('lp_search_cta');
  if (event.target?.matches?.('#knowledgeForm')) send('search_started');
});

document.addEventListener('click', event => {
  const target = event.target.closest('a,button');
  if (!target) return;
  if (target.classList.contains('wish-button')) send('wish_saved');
  if (target.classList.contains('share-discovery-button') || target.classList.contains('share-copy-button')) send('share_started');
  if (target.classList.contains('buy-link') && target.tagName === 'A') {
    const label = String(target.textContent || '').toUpperCase();
    const marketplace = label.includes('AMAZON') ? 'AMAZON_JP'
      : label.includes('楽天') || label.includes('RAKUTEN') ? 'RAKUTEN_JP'
      : label.includes('QOO10') ? 'QOO10_JP'
      : label.includes('SHEIN') ? 'SHEIN_JP' : '';
    send('marketplace_click', { marketplace });
  }
});

const results = document.querySelector('#resultsSection');
if (results) {
  new MutationObserver(() => {
    if (!results.classList.contains('hidden') && results.dataset.measured !== '1') {
      results.dataset.measured = '1';
      send('search_completed');
    }
  }).observe(results, { attributes: true, attributeFilter: ['class'] });
}
