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
  JA:{title:'AIに確認して探す',thinking:'商品を1つに絞っています…',question:name=>`この商品ですか？\n${name}`,yes:'YES、この商品を探す',no:'NO、別の候補',other:'他モールで探す',browseNow:'待たずにモールで探す',error:'候補を確認できませんでした。',finding:'確認した商品を各モールで探しています…',rejected:'違います。別の商品候補を1つ提示してください。',previewLabel:'参考画像（楽天市場の検索上位）',close:'閉じる'},
  EN:{title:'Confirm with AI',thinking:'Narrowing it to one product…',question:name=>`Is this the product?\n${name}`,yes:'YES, search for it',no:'NO, another option',other:'Search other marketplaces',browseNow:'Search marketplaces now',error:'Could not confirm a candidate.',finding:'Searching marketplaces for the confirmed product…',rejected:'No. Suggest one different product candidate.',previewLabel:'Reference images (top Rakuten results)',close:'Close'},
  ZH:{title:'先让 AI 确认',thinking:'正在缩小到一个商品…',question:name=>`是这个商品吗？\n${name}`,yes:'YES，搜索此商品',no:'NO，换一个候选',other:'前往其他商城搜索',browseNow:'无需等待，立即前往商城搜索',error:'无法确认候选商品。',finding:'正在各商城搜索已确认的商品…',rejected:'不是。请再提出一个不同的商品候选。',previewLabel:'参考图片（乐天市场搜索靠前）',close:'关闭'},
  KO:{title:'AI 확인 후 찾기',thinking:'상품을 하나로 좁히는 중…',question:name=>`이 상품인가요?\n${name}`,yes:'YES, 이 상품 찾기',no:'NO, 다른 후보',other:'다른 쇼핑몰에서 찾기',browseNow:'기다리지 않고 쇼핑몰에서 찾기',error:'상품 후보를 확인하지 못했습니다.',finding:'확인한 상품을 각 쇼핑몰에서 찾는 중…',rejected:'아닙니다. 다른 상품 후보를 하나 제시해 주세요.',previewLabel:'참고 이미지(라쿠텐 상위 결과)',close:'닫기'}
};

const channelNames = [
  ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['YouTube', 'youtube'],
  ['LINE', 'line'], ['Gmail', 'gmail'], ['X', 'x']
];

// A Turnstile callback normally arrives quickly. Keep the AI entry path
// bounded so a blocked/failed widget cannot leave the modal spinning for the
// full default token-recovery window before the marketplace fallback appears.
const AI_TOKEN_CALLBACK_TIMEOUT_MS = 3000;
// Worker budget: Turnstile verification (up to 5s) + Gemini/OpenAI shared
// provider budget (6.5s). The browser waits once for that bounded recovery,
// then immediately hands the original wording to the resilient normal search.
const AI_CHAT_HTTP_TIMEOUT_MS = 12000;

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
// 検索が結果を描画して閉じた後は、モールリンクではなく「ホシルからの
// 提案」(結果セクション)へ視点を移す(2026-09-02 実機フィードバック)。
// 縮退時もモールリンクは結果セクション内に描画されるため同じ移動先で良い。
const revealResultsSoon=()=>window.setTimeout(()=>window.HoshiluSearch?.revealResults?.(),120);

async function runFinalSearch(refinedQuery, aiCandidateFallback = null, searchOptions = {}) {
  const queryField = document.querySelector('#query');
  const searchRunner = window.HoshiluSearch?.run;
  if (!queryField || !refinedQuery || typeof searchRunner !== 'function') {
    return { ok: false, error: 'SEARCH_UNAVAILABLE' };
  }
  queryField.value = refinedQuery;
  queryField.dispatchEvent(new Event('input', { bubbles: true }));
  return searchRunner({ aiCandidateFallback, ...searchOptions });
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
      const token = await (auth?.requestToken?.(AI_TOKEN_CALLBACK_TIMEOUT_MS) ?? '');
      if (!token) throw new Error('TURNSTILE_TOKEN_UNAVAILABLE');
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history, language, mode, session_id: auth?.sessionId || '', processing_notice_shown: true, turnstile_token: token }),
        signal: AbortSignal.timeout(AI_CHAT_HTTP_TIMEOUT_MS)
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
      // A browser timeout already covers the Worker's bounded Gemini→OpenAI
      // recovery. Repeating another full 12s would only delay the guaranteed
      // normal-search fallback. Fresh-token retry remains for Turnstile,
      // quick 5xx responses, and transport failures.
      const retryable = /TURNSTILE_|CHAT_HTTP_5\d\d|CHAT_FAILED/u.test(code)
        || error instanceof TypeError || Number(error?.status || 0) >= 500;
      if (!retryable || attempt === 1) break;
      if (/TURNSTILE_/u.test(code)) await auth?.invalidateToken?.();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

// 2026-09-06 大隆さん指示: 写真・投稿URLで検索したときも、先に Gemini が特定して
// 「これですか？」を出す。ここは候補を1つもらうだけで、在庫・価格は YES の後に探す。
// 画像は最大14秒かかることがあるので、チャットより長い予算を取る。
const IDENTIFY_HTTP_TIMEOUT_MS = 30000;
async function postIdentify({ query, language, image, socialUrl }) {
  const auth = window.HoshiluChatAuth;
  const token = await (auth?.requestToken?.(AI_TOKEN_CALLBACK_TIMEOUT_MS) ?? '');
  if (!token) throw new Error('TURNSTILE_TOKEN_UNAVAILABLE');
  const response = await fetch('/api/identify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: String(query || ''), language, session_id: auth?.sessionId || '',
      processing_notice_shown: true, turnstile_token: token, defer_previews: true,
      ...(image ? { image } : {}), ...(socialUrl ? { social_url: socialUrl } : {})
    }),
    signal: AbortSignal.timeout(IDENTIFY_HTTP_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error || `IDENTIFY_HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

// 2026-09-06 大隆さん指示（待たせない）: 候補名が分かった時点でカードを出し、
// 参考画像はあとから差し込む。Worker 側は画像を取り切ってキャッシュへ書くので、
// ここは同じ鍵で数回だけ取りに行く（見つからなければ画像なしのまま。カードは出たまま）。
const PREVIEW_POLL_DELAYS_MS = [600, 1200, 2000, 3200];
async function fetchDeferredPreviews(previewsKey, onReady) {
  if (!/^[0-9a-f]{64}$/u.test(String(previewsKey || ''))) return;
  for (const delay of PREVIEW_POLL_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(`/api/identify/previews?key=${encodeURIComponent(previewsKey)}`, {
        cache: 'no-store', signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => ({}));
      const previews = Array.isArray(payload?.candidate_previews) ? payload.candidate_previews : [];
      if (payload?.ready && previews.length) { onReady(previews); return; }
      if (payload?.ready) return;
    } catch { /* 画像が出ないだけで、確認カードは使える */ }
  }
}

// 2026-09-05 大隆さん指示: チャットで提示した商品には画像を必ず添える（両モード共通の描画）。
function candidatePreviews(result){return Array.isArray(result?.candidate_previews)?result.candidate_previews.filter(item=>item?.image&&item?.name):[];}
function appendPreviewStrip(messages,previews,copy){
  if(!previews.length)return null;
  const strip=document.createElement('div');strip.className='ai-chat-preview-strip';
  strip.append(Object.assign(document.createElement('span'),{className:'ai-chat-preview-label',textContent:copy.previewLabel||chatCopy.JA.previewLabel||'参考画像'}));
  const list=document.createElement('div');list.className='ai-chat-preview-list';
  for(const item of previews){
    const node=document.createElement(item.tracking_url?'a':'div');node.className='ai-chat-preview-item';
    if(item.tracking_url){node.href=item.tracking_url;node.target='_blank';node.rel='noopener nofollow';}
    const img=document.createElement('img');img.src=item.image;img.alt='';img.loading='lazy';
    const name=document.createElement('span');name.className='ai-chat-preview-name';name.textContent=item.name;
    node.append(img,name);
    if(item.price>0){const price=document.createElement('b');price.textContent=`¥${Number(item.price).toLocaleString('ja-JP')}`;node.append(price);}
    list.append(node);
  }
  strip.append(list);messages.append(strip);return strip;
}

function openIdentifyDialog(originalQuery,language,options={}){
  if(!originalQuery)return;
  const copy=identifyCopy[language]||identifyCopy.JA;
  const executionId=String(options.executionId||'');
  let dialogDisposed=false;let handoffSettled=false;
  const settleHandoff=outcome=>{if(handoffSettled)return;handoffSettled=true;window.HoshiluSearch?.endIdentify?.(executionId,outcome);};
  const runIdentifiedSearch=(query,candidate=null,searchOptions={})=>{
    settleHandoff('searching');
    return runFinalSearch(query,candidate,{...searchOptions,...(executionId?{executionId}:{})});
  };
  const dialog=document.createElement('dialog');dialog.className='ai-chat-dialog ai-identify-dialog';
  const panel=document.createElement('div');panel.className='ai-chat-dialog-card';
  const close=document.createElement('button');close.type='button';close.className='ai-chat-dialog-close';close.setAttribute('aria-label',copy.close);close.textContent='✕';close.addEventListener('click',()=>dialog.close());
  const title=document.createElement('strong');title.textContent=copy.title;
  const messages=document.createElement('div');messages.className='ai-chat-messages';
  panel.append(close,title,messages);dialog.append(panel);document.body.append(dialog);
  dialog.addEventListener('close',()=>{dialogDisposed=true;settleHandoff('handoff');dialog.remove();document.querySelector('#submitButton')?.focus({preventScroll:true});});
  // 写真・投稿URLから始まった確認は、YES のあとに同じ画像をもう一度解析させない
  // （確定した商品名で探す）。文字だけの確認は従来どおり。
  const identifyImage=options.image||null;const identifySocialUrl=String(options.socialUrl||'');
  const startedFromMedia=Boolean(identifyImage||identifySocialUrl);
  const history=[{role:'user',text:originalQuery||(identifySocialUrl?identifySocialUrl:'この写真の商品')}];let noCount=0;let otherMallsButton=null;
  const browseNow=document.createElement('button');browseNow.type='button';browseNow.className='ai-chat-other-malls ai-chat-browse-now';browseNow.textContent=copy.browseNow;
  browseNow.addEventListener('click',()=>{settleHandoff('handoff');dialog.close();window.setTimeout(()=>document.querySelector('#instantMarketplaceFallback')?.scrollIntoView({behavior:'smooth',block:'start'}),120);});
  messages.append(chatMessageRow('user',originalQuery),browseNow);
  const showOtherMalls=()=>{
    if(otherMallsButton?.isConnected||dialogDisposed)return;
    const button=document.createElement('button');otherMallsButton=button;button.type='button';button.className='ai-chat-other-malls';button.textContent=copy.other;
    button.addEventListener('click',async()=>{button.disabled=true;const status=chatMessageRow('assistant',copy.finding);status.classList.add('ai-chat-message-status');messages.append(status);const outcome=await runIdentifiedSearch(originalQuery);if(dialogDisposed)return;if(outcome.ok||outcome.degraded){dialog.close();revealResultsSoon();}else button.disabled=false;});
    messages.append(button);
  };
  const ask=async()=>{
    if(dialogDisposed)return;
    const status=chatMessageRow('assistant',copy.thinking);status.classList.add('ai-chat-message-status');messages.append(status);
    try{
      const result=startedFromMedia&&noCount===0
        ? await postIdentify({query:originalQuery,language,image:identifyImage,socialUrl:identifySocialUrl})
        : await postChatTurn(history,language,'IDENTIFY');
      if(dialogDisposed){status.remove();return;}
      status.remove();
      const candidate=String(result.candidate_name||result.refined_query||'').trim();if(!candidate)throw new Error('CANDIDATE_EMPTY');
      const aiCandidateFallback={name:candidate,brand:String(result.candidate_brand||''),reason:String(result.candidate_reason||''),matched_features:Array.isArray(result.matched_features)?result.matched_features:[],match_score:Number(result.match_score||0),search_keywords:[String(result.refined_query||candidate)],marketplace_search_links:Array.isArray(result.marketplace_search_links)?result.marketplace_search_links:[]};
      history.push({role:'assistant',text:candidate});
      const question=chatMessageRow('assistant',copy.question(candidate));question.classList.add('ai-chat-identify-question');messages.append(question);
      // 2026-09-04 大隆さん指示: 名前だけでは合っているか分からないので、参考画像を同じ流れで見せる。
      const previews=candidatePreviews(result);
      appendPreviewStrip(messages,previews,copy);
      if(previews[0]?.image){aiCandidateFallback.image=previews[0].image;aiCandidateFallback.previews=previews;}
      // 参考画像を待たずにカードを出したときは、あとから同じ流れに差し込む。
      if(!previews.length&&result.previews_key){
        void fetchDeferredPreviews(result.previews_key,(late)=>{
          if(dialogDisposed)return;
          appendPreviewStrip(messages,late,copy);
          if(late[0]?.image){aiCandidateFallback.image=late[0].image;aiCandidateFallback.previews=late;}
        });
      }
      const actions=document.createElement('div');actions.className='ai-chat-confirm-actions';
      const yes=document.createElement('button');yes.type='button';yes.className='ai-chat-confirm-yes';yes.textContent=copy.yes;
      const no=document.createElement('button');no.type='button';no.className='ai-chat-confirm-no';no.textContent=copy.no;
      yes.addEventListener('click',async()=>{yes.disabled=true;no.disabled=true;const finding=chatMessageRow('assistant',copy.finding);finding.classList.add('ai-chat-message-status');messages.append(finding);const outcome=await runIdentifiedSearch(result.refined_query||candidate,aiCandidateFallback,startedFromMedia?{skipSupplementalInput:true}:{});finding.remove();if(dialogDisposed)return;if(outcome.ok||outcome.degraded){dialog.close();revealResultsSoon();}else{messages.append(chatMessageRow('assistant',copy.error));yes.disabled=false;no.disabled=false;}});
      no.addEventListener('click',()=>{actions.remove();noCount+=1;history.push({role:'user',text:copy.rejected});messages.append(chatMessageRow('user',copy.no));if(noCount>=3){showOtherMalls();return;}void ask();});
      actions.append(yes,no);messages.append(actions);
    }catch(error){
      if(dialogDisposed){status.remove();return;}
      const code=String(error?.message||'CHAT_FAILED');console.error('HOSHILU_IDENTIFY_FAILED',code,error);status.textContent=copy.finding;
      const outcome=await runIdentifiedSearch(originalQuery,null,{tokenCallbackTimeoutMs:AI_TOKEN_CALLBACK_TIMEOUT_MS,maxAttempts:1});
      status.remove();
      if(dialogDisposed)return;
      if(outcome.ok||outcome.degraded){dialog.close();revealResultsSoon();return;}
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
      if (outcome.ok || outcome.degraded) { dialog.close(); revealResultsSoon(); return; }
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
        revealResultsSoon();
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
      appendPreviewStrip(messages,candidatePreviews(result),copy);
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
      const outcome = await runFinalSearch(directQuery,null,{tokenCallbackTimeoutMs:AI_TOKEN_CALLBACK_TIMEOUT_MS,maxAttempts:1});
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
    if (destination.dataset.marketplace) link.dataset.marketplace = destination.dataset.marketplace;
    if (!String(destination.getAttribute('href') || '').startsWith('#')) {
      link.target = '_blank';
      link.rel = destination.dataset.marketplace === 'AMAZON_JP'
        ? 'sponsored nofollow noopener noreferrer'
        : 'noopener noreferrer';
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
