const languageCopy = {
  JA: ['HOSHILU AIでも候補を探す', 'HOSHILU内で結果を表示します'],
  EN: ['Search with HOSHILU AI', 'Results stay inside HOSHILU'],
  ZH: ['使用 HOSHILU AI 查找候选', '结果显示在 HOSHILU 内'],
  KO: ['HOSHILU AI로 후보 찾기', 'HOSHILU 안에서 결과를 표시합니다']
};

const channelNames = [
  ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['YouTube', 'youtube'],
  ['LINE', 'line'], ['Gmail', 'gmail'], ['X', 'x']
];

function decorateLinks(container) {
  for (const link of container.querySelectorAll('.marketplace-search-link')) {
    const label = String(link.textContent || '').trim();
    const match = channelNames.find(([name]) => label.startsWith(name));
    if (match) link.dataset.channel = match[1];
  }
}

function addAiAction() {
  const fallback = document.querySelector('.marketplace-fallback');
  if (!fallback || fallback.querySelector('.hoshilu-ai-search')) return;
  decorateLinks(fallback);
  const language = document.querySelector('[data-language-select]')?.value || 'JA';
  const [title, note] = languageCopy[language] || languageCopy.JA;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hoshilu-ai-search';
  button.innerHTML = `<strong>${title}</strong><small>${note}</small>`;
  button.addEventListener('click', () => document.querySelector('#submitButton')?.click());
  fallback.insertBefore(button, fallback.querySelector('.marketplace-links'));
}

function linkDisplayedProducts() {
  for (const card of document.querySelectorAll('.product-card:not([data-product-linked])')) {
    const destination = card.querySelector('a.offer-link,a.price-offer,a.all-marketplaces-button');
    const image = card.querySelector(':scope > .product-image');
    const title = card.querySelector(':scope > h3');
    if (!destination || (!image && !title)) continue;
    const link = document.createElement('a');
    link.className = 'product-primary-link';
    link.href = destination.href;
    if (!String(destination.getAttribute('href') || '').startsWith('#')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.setAttribute('aria-label', `${String(title?.textContent || '').trim()}の商品ページを見る`);
    if (image) link.append(image);
    if (title) link.append(title);
    card.insertBefore(link, card.querySelector('.evidence,.offer-list,.price-comparison,.price-offer,.all-marketplaces-button') || card.firstChild?.nextSibling || null);
    card.dataset.productLinked = 'true';
  }
}

function enhanceResults() {
  addAiAction();
  linkDisplayedProducts();
}

const results = document.querySelector('#resultCards');
if (results) new MutationObserver(enhanceResults).observe(results, { childList: true, subtree: true });
enhanceResults();
