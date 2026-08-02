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

const results = document.querySelector('#resultCards');
if (results) new MutationObserver(addAiAction).observe(results, { childList: true, subtree: true });
addAiAction();
