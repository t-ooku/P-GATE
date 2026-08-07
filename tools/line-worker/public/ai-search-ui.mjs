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
  JA: { title: 'HOSHILU AIチャット', placeholder: '返信を入力…', send: '送信', searching: '探しています…', finding: '条件に合う商品を探しています…', error: '通信に失敗しました。もう一度お試しください。', searchError: '検索に失敗しました。もう一度お試しください。', retry: 'もう一度試す', close: '閉じる' },
  EN: { title: 'HOSHILU AI Chat', placeholder: 'Type a reply…', send: 'Send', searching: 'Searching…', finding: 'Looking for matching products…', error: 'Something went wrong. Please try again.', searchError: 'Search failed. Please try again.', retry: 'Try again', close: 'Close' },
  ZH: { title: 'HOSHILU AI 聊天', placeholder: '输入回复…', send: '发送', searching: '正在查找…', finding: '正在查找符合条件的商品…', error: '通信失败，请重试。', searchError: '搜索失败，请重试。', retry: '重试', close: '关闭' },
  KO: { title: 'HOSHILU AI 채팅', placeholder: '답장을 입력…', send: '보내기', searching: '찾고 있습니다…', finding: '조건에 맞는 상품을 찾고 있습니다…', error: '통신에 실패했습니다. 다시 시도해 주세요.', searchError: '검색에 실패했습니다. 다시 시도해 주세요.', retry: '다시 시도', close: '닫기' }
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

// Runs the real /api/knowledge search HOSHILU's main form uses (via
// window.HoshiluSearch, exposed by app.js) and reports back whether it
// actually succeeded - unlike the previous approach (simulate a click on
// the submit button, then poll its disabled state), which could not tell
// "results rendered" apart from "silently did nothing".
async function runFinalSearch(refinedQuery) {
  const queryField = document.querySelector('#query');
  const searchRunner = window.HoshiluSearch?.run;
  if (!queryField || !refinedQuery || typeof searchRunner !== 'function') {
    return { ok: false, error: 'SEARCH_UNAVAILABLE' };
  }
  // The chat's own last turn just consumed the Turnstile token via
  // /api/ai-chat. Refresh it here so the main search's own token wait does
  // not immediately reuse that already-consumed token and fail.
  await window.HoshiluChatAuth?.requestToken?.();
  queryField.value = refinedQuery;
  queryField.dispatchEvent(new Event('input', { bubbles: true }));
  return searchRunner();
}

function chatMessageRow(role, text) {
  const row = document.createElement('div');
  row.className = `ai-chat-message ai-chat-message-${role}`;
  row.textContent = text;
  return row;
}

async function postChatTurn(history, language) {
  const auth = window.HoshiluChatAuth;
  const token = await (auth?.requestToken?.() ?? '');
  // Turnstile が用意できないまま送ると、サーバー側では
  // TURNSTILE_TOKEN_INVALID として弾かれる。原因が「認証の準備ができて
  // いない」なのか「通信そのものが失敗した」なのかを取り違えると、直す
  // 場所を間違えるので、ここで区別できる形で止める。
  if (!token) throw new Error('TURNSTILE_TOKEN_UNAVAILABLE');
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

  // Failure here means the /api/knowledge search itself failed (network,
  // Turnstile, API error) - never invented by this dialog. Per the RC2
  // completion criteria, the dialog must stay open with a diagnosable error
  // and a retry, not close silently.
  function showSearchError(refinedQuery) {
    messages.append(chatMessageRow('assistant', copy.searchError));
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'ai-chat-retry';
    retry.textContent = copy.retry;
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      retry.remove();
      const status = chatMessageRow('assistant', copy.finding);
      status.classList.add('ai-chat-message-status');
      messages.append(status);
      const outcome = await runFinalSearch(refinedQuery);
      status.remove();
      if (outcome.ok) { dialog.close(); return; }
      showSearchError(refinedQuery);
    });
    messages.append(retry);
  }

  async function runTurn() {
    form.classList.add('hidden');
    const status = chatMessageRow('assistant', copy.searching);
    status.classList.add('ai-chat-message-status');
    messages.append(status);
    try {
      const result = await postChatTurn(history, language);
      if (result.needs_clarification && result.clarifying_question) {
        status.remove();
        history.push({ role: 'assistant', text: result.clarifying_question });
        messages.append(chatMessageRow('assistant', result.clarifying_question));
        form.classList.remove('hidden');
        input.value = '';
        input.focus();
        return;
      }
      // Do not close the dialog yet - stay open through the real search so
      // failure can be shown and retried (see showSearchError above), per
      // the RC2 report: "検索中表示 → 結果取得成功 → 検索欄へ最終検索文を
      // 反映 → 商品結果を描画 → ダイアログを閉じる".
      const refinedQuery = result.refined_query || originalQuery;
      status.textContent = copy.finding;
      const outcome = await runFinalSearch(refinedQuery);
      status.remove();
      if (outcome.ok) {
        dialog.close();
        return;
      }
      showSearchError(refinedQuery);
    } catch (error) {
      // 以前は catch {} でエラーを完全に捨てていたため、画面には
      // 「通信に失敗しました」としか出ず、実際に何が起きたのか
      // (Turnstile未準備・APIキー未設定・レート制限のどれか) が
      // 利用者からも開発者からも分からなかった。原因の判別が付かない
      // 障害は直しようがないので、コードを画面とコンソールの両方に出す。
      const code = String(error?.message || 'CHAT_FAILED');
      console.error('HOSHILU_CHAT_FAILED', code, error);
      status.remove();
      messages.append(chatMessageRow('assistant', `${copy.error}（${code}）`));
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
