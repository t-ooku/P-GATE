const languageCopy = {
  JA: ['HOSHILU AIでも候補を探す', 'HOSHILU内で結果を表示します'],
  EN: ['Search with HOSHILU AI', 'Results stay inside HOSHILU'],
  ZH: ['使用 HOSHILU AI 查找候选', '结果显示在 HOSHILU 内'],
  KO: ['HOSHILU AI로 후보 찾기', 'HOSHILU 안에서 결과를 표시합니다']
};

// HOSHILU AI Chat (2026-08-05): as few turns as possible, then hand off to
// the real search. The chat itself never invents a product - it only ends
// with refined_query, which is submitted to the existing #submitButton /
// /api/knowledge flow (Teacher Dataset, ranking, all marketplaces
// untouched). Stays entirely inside HOSHILU (calls our own /api/ai-chat,
// never links out to an external AI chat site).
const chatCopy = {
  JA: { title: 'HOSHILU AIチャット', placeholder: '返信を入力…', send: '送信', searching: '探しています…', error: '通信に失敗しました。もう一度お試しください。', close: '閉じる' },
  EN: { title: 'HOSHILU AI Chat', placeholder: 'Type a reply…', send: 'Send', searching: 'Searching…', error: 'Something went wrong. Please try again.', close: 'Close' },
  ZH: { title: 'HOSHILU AI 聊天', placeholder: '输入回复…', send: '发送', searching: '正在查找…', error: '通信失败，请重试。', close: '关闭' },
  KO: { title: 'HOSHILU AI 채팅', placeholder: '답장을 입력…', send: '보내기', searching: '찾고 있습니다…', error: '통신에 실패했습니다. 다시 시도해 주세요.', close: '닫기' }
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

function chatMessageRow(role, text) {
  const row = document.createElement('div');
  row.className = `ai-chat-message ai-chat-message-${role}`;
  row.textContent = text;
  return row;
}

async function submitRefinedQuery(refinedQuery) {
  const submitButton = document.querySelector('#submitButton');
  const queryField = document.querySelector('#query');
  if (!submitButton || !queryField || !refinedQuery) return;
  // The chat's own last turn just consumed the Turnstile token via
  // /api/ai-chat. Refresh it here so the main search form's own token wait
  // does not immediately reuse that already-consumed token and fail.
  await window.HoshiluChatAuth?.requestToken?.();
  queryField.value = refinedQuery;
  submitButton.click();
  await waitForSearchCompletion(submitButton);
}

async function postChatTurn(history, language) {
  const auth = window.HoshiluChatAuth;
  const token = await (auth?.requestToken?.() ?? '');
  const response = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ history, language, session_id: auth?.sessionId || '', consent: true, turnstile_token: token })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'CHAT_FAILED');
  return payload.result;
}

function openChatDialog(originalQuery, language) {
  const copy = chatCopy[language] || chatCopy.JA;
  const dialog = document.createElement('dialog');
  dialog.className = 'ai-chat-dialog';
  const panel = document.createElement('div');
  panel.className = 'ai-chat-dialog-card';
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'ai-chat-dialog-close'; close.setAttribute('aria-label', copy.close); close.textContent = '✕';
  close.addEventListener('click', () => dialog.close());
  const title = document.createElement('strong'); title.textContent = copy.title;
  const messages = document.createElement('div'); messages.className = 'ai-chat-messages';
  const form = document.createElement('form'); form.className = 'ai-chat-form';
  const input = document.createElement('input'); input.type = 'text'; input.placeholder = copy.placeholder; input.maxLength = 200; input.required = true;
  const send = document.createElement('button'); send.type = 'submit'; send.textContent = copy.send;
  form.append(input, send);
  form.classList.add('hidden');
  panel.append(close, title, messages, form);
  dialog.append(panel);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const history = [{ role: 'user', text: originalQuery }];
  messages.append(chatMessageRow('user', originalQuery));

  async function runTurn() {
    form.classList.add('hidden');
    const status = chatMessageRow('assistant', copy.searching);
    status.classList.add('ai-chat-message-status');
    messages.append(status);
    try {
      const result = await postChatTurn(history, language);
      status.remove();
      if (result.needs_clarification && result.clarifying_question) {
        history.push({ role: 'assistant', text: result.clarifying_question });
        messages.append(chatMessageRow('assistant', result.clarifying_question));
        form.classList.remove('hidden');
        input.value = '';
        input.focus();
        return;
      }
      dialog.close();
      await submitRefinedQuery(result.refined_query || originalQuery);
    } catch {
      status.remove();
      messages.append(chatMessageRow('assistant', copy.error));
      form.classList.remove('hidden');
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const reply = input.value.trim();
    if (!reply) return;
    history.push({ role: 'user', text: reply });
    messages.append(chatMessageRow('user', reply));
    input.value = '';
    runTurn();
  });

  dialog.showModal();
  runTurn();
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
  button.addEventListener('click', () => {
    const originalQuery = String(document.querySelector('#query')?.value || '').trim();
    if (!originalQuery) return;
    openChatDialog(originalQuery, language);
  });
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
