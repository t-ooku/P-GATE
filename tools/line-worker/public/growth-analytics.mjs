const params = new URLSearchParams(location.search);
const attribution = {
  source: params.get('utm_source') || '',
  medium: params.get('utm_medium') || '',
  campaign: params.get('utm_campaign') || params.get('campaign') || '',
  content: params.get('utm_content') || ''
};
window.HoshiluGrowthAttribution = Object.freeze({ ...attribution });
const locale = () => String(document.documentElement.lang || 'ja').split('-')[0].toUpperCase();
const send = (event_type, extra = {}) => {
  const body = JSON.stringify({ event_type, locale: locale(), ...attribution, ...extra });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
};

send('landing_view');

document.addEventListener('submit', event => {
  if (event.target?.id === 'knowledgeForm') send('search_started');
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
