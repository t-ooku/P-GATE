// v4.2 項目4: 表記から「HOSHILU」の冠称を外し、正式表示は「AIで探す」とする。
const languageCopy = {
  JA: ['AIで探す', 'HOSHILU内で結果を表示します'],
  EN: ['Search with AI', 'Results stay inside HOSHILU'],
  ZH: ['使用 AI 查找候选', '结果显示在 HOSHILU 内'],
  KO: ['AI로 찾기', 'HOSHILU 안에서 결과를 표시합니다']
};

// HOSHILU AI Chat (2026-08-05): as few turns as possible, then hand off to
// the real search. IDENTIFY may return one product-name hypothesis for the
// user to confirm, but never a verified listing, price, stock value, or URL.
// The confirmed hypothesis is submitted to /api/knowledge and is retained as
// an explicitly unverified AI candidate if the connected marketplace APIs do
// not return a product card. Stays entirely inside HOSHILU.
// v4.3 項目6: 会話が完了しても即座に自動検索へ進まず、チャット内に明確な
// 「この条件で探す」CTAを設置し、押した時にだけHOSHILU検索へ戻す
// (Gemini自身が商品一覧を作って会話を終える設計は禁止 - このCTAが
// 「会話の結果をHOSHILU検索へ渡す」という一回きりの明示的な操作になる)。
const chatCopy = {
  JA: { title: 'AIチャット', placeholder: '返信を入力…', send: '送信', searching: '探しています…', finding: '条件に合う商品を探しています…', error: '通信に失敗しました。もう一度お試しください。', searchError: '検索に失敗しました。もう一度お試しください。', retry: 'もう一度試す', close: '閉じる', ready: '検索の準備ができました。', searchCta: 'この条件で探す' },
  EN: { title: 'AI Chat', placeholder: 'Type a reply…', send: 'Send', searching: 'Searching…', finding: 'Looking for matching products…', error: 'Something went wrong. Please try again.', searchError: 'Search failed. Please try again.', retry: 'Try again', close: 'Close', ready: 'Ready to search.', searchCta: 'Search with this' },
  ZH: { title: 'AI 聊天', placeholder: '输入回复…', send: '发送', searching: '正在查找…', finding: '正在查找符合条件的商品…', error: '通信失败，请重试。', searchError: '搜索失败，请重试。', retry: '重试', close: '关闭', ready: '已准备好搜索。', searchCta: '用这个条件搜索' },
  KO: { title: 'AI 채팅', placeholder: '답장을 입력…', send: '보내기', searching: '찾고 있습니다…', finding: '조건에 맞는 상품을 찾고 있습니다…', error: '통신에 실패했습니다. 다시 시도해 주세요.', searchError: '검색에 실패했습니다. 다시 시도해 주세요.', retry: '다시 시도', close: '닫기', ready: '검색 준비가 되었습니다.', searchCta: '이 조건으로 찾기' }
};
const identifyCopy={
  JA:{title:'AIに確認して探す',thinking:'商品を1つに絞っています…',question:name=>`この商品ですか？\n${name}`,yes:'YES、この商品を探す',no:'NO、別の候補',other:'他モールで探す',error:'候補を確認できませんでした。',finding:'確認した商品を各モールで探しています…',rejected:'違います。別の商品候補を1つ提示してください。',close:'閉じる'},
  EN:{title:'Confirm with AI',thinking:'Narrowing it to one product…',question:name=>`Is this the product?\n${name}`,yes:'YES, search for it',no:'NO, another option',other:'Search other marketplaces',error:'Could not confirm a candidate.',finding:'Searching marketplaces for the confirmed product…',rejected:'No. Suggest one different product candidate.',close:'Close'},
  ZH:{title:'先让 AI 确认',thinking:'正在缩小到一个商品…',question:name=>`是这个商品吗？\n${name}`,yes:'YES，搜索此商品',no:'NO，换一个候选',other:'前往其他商城搜索',error:'无法确认候选商品。',finding:'正在各商城搜索已确认的商品…',rejected:'不是。请再提出一个不同的商品候选。',close:'关闭'},
  KO:{title:'AI 확인 후 찾기',thinking:'상품을 하나로 좁히는 중…',question:name=>`이 상품인가요?\n${name}`,yes:'YES, 이 상품 찾기',no:'NO, 다른 후보',other:'다른 쇼핑몰에서 찾기',error:'상품 후보를 확인하지 못했습니다.',finding:'확인한 상품을 각 쇼핑몰에서 찾는 중…',rejected:'아닙니다. 다른 상품 후보를 하나 제시해 주세요.',close:'닫기'}
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
async function runFinalSearch(refinedQuery, aiCandidateFallback = null) {
  const queryField = document.querySelector('#query');
  const searchRunner = window.HoshiluSearch?.run;
  if (!queryField || !refinedQuery || typeof searchRunner !== 'function') {
    return { ok: false, error: 'SEARCH_UNAVAILABLE' };
  }
  queryField.value = refinedQuery;
  queryField.dispatchEvent(new Event('input', { bubbles: true }));
  return searchRunner({ aiCandidateFallback });
}

function chatMessageRow(role, text) {
  const row = document.createElement('div');
  row.className = `ai-chat-message ai-chat-message-${role}`;
  row.textContent = text;
  return row;
}

async function postChatTurn(history, language, mode = 'REFINE') {
  const auth = window.HoshiluChatAuth;
  let lastError = new Error('CHAT_FAILED');
  // Turnstile tokenは単回使用。Chromeでreset直後に古い応答が一瞬残る場合や、
  // 一時的なWorker障害で確認モード全体を即終了させないよう、毎回別トークンを
  // 取り直して1回だけ自動再試行する。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const token = await (auth?.requestToken?.() ?? '');
      if (!token) throw new Error('TURNSTILE_TOKEN_UNAVAILABLE');
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history, language, mode, session_id: auth?.sessionId || '', consent: true, turnstile_token: token })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        const error = new Error(payload.error || `CHAT_HTTP_${response.status}`);
        error.status = response.status;
        throw error;
      }
      return payload.result;
    } catch (error) {
      lastError = error;
      const code = String(error?.message || 'CHAT_FAILED');
      const retryable = /TURNSTILE_|CHAT_HTTP_5\d\d|CHAT_FAILED/u.test(code) || Number(error?.status || 0) >= 500;
      if (!retryable || attempt === 1) break;
      if (/TURNSTILE_/u.test(code)) await auth?.invalidateToken?.();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

function openIdentifyDialog(originalQuery,language){
  if(!originalQuery)return;
  const copy=identifyCopy[language]||identifyCopy.JA;
  const dialog=document.createElement('dialog');dialog.className='ai-chat-dialog ai-identify-dialog';
  const panel=document.createElement('div');panel.className='ai-chat-dialog-card';
  const close=document.createElement('button');close.type='button';close.className='ai-chat-dialog-close';close.setAttribute('aria-label',copy.close);close.textContent='✕';close.addEventListener('click',()=>dialog.close());
  const title=document.createElement('strong');title.textContent=copy.title;
  const messages=document.createElement('div');messages.className='ai-chat-messages';
  panel.append(close,title,messages);dialog.append(panel);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());
  const history=[{role:'user',text:originalQuery}];let noCount=0;let otherMallsButton=null;
  messages.append(chatMessageRow('user',originalQuery));
  const showOtherMalls=()=>{
    if(otherMallsButton?.isConnected)return;
    const button=document.createElement('button');otherMallsButton=button;button.type='button';button.className='ai-chat-other-malls';button.textContent=copy.other;
    button.addEventListener('click',async()=>{button.disabled=true;const status=chatMessageRow('assistant',copy.finding);status.classList.add('ai-chat-message-status');messages.append(status);await runFinalSearch(originalQuery);dialog.close();window.setTimeout(()=>document.querySelector('#marketplaceFallback,.marketplace-fallback')?.scrollIntoView({behavior:'smooth',block:'start'}),120);});
    messages.append(button);
  };
  const ask=async()=>{
    const status=chatMessageRow('assistant',copy.thinking);status.classList.add('ai-chat-message-status');messages.append(status);
    try{
      const result=await postChatTurn(history,language,'IDENTIFY');status.remove();
      const candidate=String(result.candidate_name||result.refined_query||'').trim();if(!candidate)throw new Error('CANDIDATE_EMPTY');
      const aiCandidateFallback={name:candidate,brand:String(result.candidate_brand||''),reason:String(result.candidate_reason||''),matched_features:Array.isArray(result.matched_features)?result.matched_features:[],match_score:Number(result.match_score||0),search_keywords:[String(result.refined_query||candidate)],marketplace_search_links:Array.isArray(result.marketplace_search_links)?result.marketplace_search_links:[]};
      history.push({role:'assistant',text:candidate});
      const question=chatMessageRow('assistant',copy.question(candidate));question.classList.add('ai-chat-identify-question');messages.append(question);
      const actions=document.createElement('div');actions.className='ai-chat-confirm-actions';
      const yes=document.createElement('button');yes.type='button';yes.className='ai-chat-confirm-yes';yes.textContent=copy.yes;
      const no=document.createElement('button');no.type='button';no.className='ai-chat-confirm-no';no.textContent=copy.no;
      yes.addEventListener('click',async()=>{yes.disabled=true;no.disabled=true;const finding=chatMessageRow('assistant',copy.finding);finding.classList.add('ai-chat-message-status');messages.append(finding);const outcome=await runFinalSearch(result.refined_query||candidate,aiCandidateFallback);finding.remove();if(outcome.ok||outcome.degraded)dialog.close();else{messages.append(chatMessageRow('assistant',copy.error));yes.disabled=false;no.disabled=false;}});
      no.addEventListener('click',()=>{actions.remove();noCount+=1;history.push({role:'user',text:copy.rejected});messages.append(chatMessageRow('user',copy.no));if(noCount>=3){showOtherMalls();return;}void ask();});
      actions.append(yes,no);messages.append(actions);
    }catch(error){
      const code=String(error?.message||'CHAT_FAILED');console.error('HOSHILU_IDENTIFY_FAILED',code,error);status.textContent=copy.error;
      status.textContent=copy.finding;
      const outcome=await runFinalSearch(originalQuery);
      status.remove();
      if(outcome.ok||outcome.degraded){dialog.close();return;}
      messages.append(chatMessageRow('assistant',copy.error));showOtherMalls();
    }
  };
  dialog.showModal();void ask();
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
      if (outcome.ok || outcome.degraded) { dialog.close(); return; }
      showSearchError(refinedQuery);
    });
    messages.append(retry);
  }

  // v4.3 項目6: 会話が完了(needs_clarification=false)した直後に自動で
  // 検索へ進まない。「この条件で探す」ボタンを押した時にだけ、その時点の
  // refinedQueryでHOSHILU検索(runFinalSearch)へ進む。Geminiが商品一覧を
  // 創作して会話を終える設計は禁止なので、この関数はrefinedQuery(文字列)
  // 以外の商品情報を一切扱わない。
  function showSearchCta(refinedQuery) {
    const readyRow = chatMessageRow('assistant', copy.ready);
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'ai-chat-search-cta';
    cta.textContent = copy.searchCta;
    cta.addEventListener('click', async () => {
      cta.disabled = true;
      const status = chatMessageRow('assistant', copy.finding);
      status.classList.add('ai-chat-message-status');
      messages.append(status);
      const outcome = await runFinalSearch(refinedQuery);
      status.remove();
      if (outcome.ok || outcome.degraded) {
        dialog.close();
        return;
      }
      cta.remove();
      readyRow.remove();
      showSearchError(refinedQuery);
    });
    messages.append(readyRow, cta);
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
      // Conversation is done. Show the explicit "この条件で探す" CTA and
      // wait for the user to press it - never auto-search here (see
      // showSearchCta above and v4.3 spec section 6).
      const refinedQuery = result.refined_query || originalQuery;
      status.remove();
      showSearchCta(refinedQuery);
    } catch (error) {
      // Technical details stay in the console for diagnosis. The customer
      // sees a stable recovery message rather than a Turnstile/container
      // implementation error that they cannot act on.
      const code = String(error?.message || 'CHAT_FAILED');
      console.error('HOSHILU_CHAT_FAILED', code, error);
      status.textContent = copy.finding;
      const directQuery = history.filter((turn) => turn.role === 'user')
        .map((turn) => String(turn.text || '').trim()).filter(Boolean).join(' / ') || originalQuery;
      const outcome = await runFinalSearch(directQuery);
      status.remove();
      if (outcome.ok || outcome.degraded) { dialog.close(); return; }
      showSearchError(directQuery);
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
    const mediaColumn = card.querySelector(':scope > .product-card-media-column');
    const title = card.querySelector(':scope > h3');
    if (!destination || !title) continue;
    const link = document.createElement('a');
    link.className = 'product-primary-link';
    link.href = destination.href;
    if (!String(destination.getAttribute('href') || '').startsWith('#')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.setAttribute('aria-label', `${String(title?.textContent || '').trim()}の商品ページを見る`);
    if (title) link.append(title);
    card.insertBefore(link, mediaColumn?.nextSibling || card.querySelector('.evidence,.offer-list,.price-comparison,.price-offer,.all-marketplaces-button') || card.firstChild?.nextSibling || null);
    card.dataset.productLinked = 'true';
  }
}

function enhanceResults() {
  addAiAction();
  linkDisplayedProducts();
}

window.HoshiluIdentifySearch={open:openIdentifyDialog};

const results = document.querySelector('#resultCards');
if (results) new MutationObserver(enhanceResults).observe(results, { childList: true, subtree: true });
enhanceResults();
