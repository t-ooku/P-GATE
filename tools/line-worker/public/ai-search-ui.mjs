const languageCopy = {
  JA: ['HOSHILU AIでも候補を探す', 'HOSHILU内で結果を表示します'],
  EN: ['Search with HOSHILU AI', 'Results stay inside HOSHILU'],
  ZH: ['使用 HOSHILU AI 查找候选', '结果显示在 HOSHILU 内'],
  KO: ['HOSHILU AI로 후보 찾기', 'HOSHILU 안에서 결과를 표시합니다']
};

const progressCopy = {
  JA: ['AIで候補を探しています…', '候補を確認できませんでした。検索語を変えてお試しください。'],
  EN: ['Searching with AI…', 'No verified candidate was found. Try changing the search terms.'],
  ZH: ['正在使用 AI 查找候选…', '未找到可确认的候选商品。请更改搜索词后重试。'],
  KO: ['AI로 후보를 찾고 있습니다…', '확인 가능한 후보를 찾지 못했습니다. 검색어를 바꿔 다시 시도해 주세요.']
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

function waitForSearchCompletion(submitButton, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let observedBusy = submitButton.disabled;
    const timer = setInterval(() => {
      observedBusy ||= submitButton.disabled;
      if ((observedBusy && !submitButton.disabled) || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

async function runAiSearch(button) {
  const submitButton = document.querySelector('#submitButton');
  if (!submitButton || submitButton.disabled || button.disabled) return;
  const language = document.querySelector('[data-language-select]')?.value || 'JA';
  const [loading, empty] = progressCopy[language] || progressCopy.JA;
  const original = button.innerHTML;
  const status = document.querySelector('#status');

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `<strong>${loading}</strong><small>Gemini → GPT</small>`;
  if (status) {
    status.className = 'status';
    status.textContent = loading;
  }

  submitButton.click();
  await waitForSearchCompletion(submitButton);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const candidates = document.querySelectorAll('#resultCards .product-card');
  const fallback = document.querySelector('#resultCards .marketplace-fallback');
  if (!candidates.length && fallback && status) {
    status.className = 'status';
    status.textContent = empty;
  }

  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.innerHTML = original;
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
  button.addEventListener('click', () => runAiSearch(button));
  fallback.insertBefore(button, fallback.querySelector('.marketplace-fallback-group'));
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
