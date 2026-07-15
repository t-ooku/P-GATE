const copy = {
  JA: {
    lead: '日本語の商品情報から、あなたの言葉に合う候補を根拠付きで提案します。',
    title: '何を探していますか？', placeholder: '例：アメリカのシリアルが食べたい',
    consent: '質問の処理と匿名の利用状況計測に同意します。質問本文はサーバーログへ保存しません。',
    submit: '候補を見つける', results: 'P-GATEからの提案', loading: '商品情報を確認しています…',
    buy: '販売ページで確認', error: '現在検索できません。入力内容を確認して、もう一度お試しください。',
    examples: ['朝食に合うシリアル', '日本で買えるアメリカのお菓子', 'プレゼント向けの商品']
  },
  EN: {
    lead: 'Ask in your language. P-GATE connects your needs to verified Japanese product data.',
    title: 'What are you looking for?', placeholder: 'Example: I want an American breakfast cereal',
    consent: 'I consent to processing my question and anonymous usage measurement. The raw question is not stored in server logs.',
    submit: 'Find products', results: 'Suggestions from P-GATE', loading: 'Checking product information…',
    buy: 'View product page', error: 'Search is unavailable. Check your input and try again.',
    examples: ['breakfast cereal', 'American snacks available in Japan', 'a product for a gift']
  },
  ZH: {
    lead: '用您的语言提问。P-GATE会将需求与已确认的日文商品信息关联起来。',
    title: '您在找什么？', placeholder: '例如：我想找美国早餐麦片',
    consent: '我同意处理问题及匿名使用情况统计。服务器日志不会保存问题原文。',
    submit: '查找商品', results: 'P-GATE的建议', loading: '正在确认商品信息…',
    buy: '查看销售页面', error: '目前无法搜索。请确认输入后重试。',
    examples: ['早餐麦片', '在日本可以买到的美国零食', '适合作为礼物的商品']
  },
  KO: {
    lead: '원하는 언어로 질문하세요. P-GATE가 확인된 일본어 상품 정보와 연결합니다.',
    title: '어떤 상품을 찾고 있나요?', placeholder: '예: 미국 아침 시리얼을 찾고 있어요',
    consent: '질문 처리와 익명 이용 측정에 동의합니다. 질문 원문은 서버 로그에 저장하지 않습니다.',
    submit: '상품 찾기', results: 'P-GATE 추천', loading: '상품 정보를 확인하고 있습니다…',
    buy: '판매 페이지 확인', error: '현재 검색할 수 없습니다. 입력 내용을 확인하고 다시 시도해 주세요.',
    examples: ['아침 시리얼', '일본에서 살 수 있는 미국 과자', '선물용 상품']
  }
};

const elements = {
  form: document.querySelector('#knowledgeForm'), query: document.querySelector('#query'),
  consent: document.querySelector('#consent'), language: document.querySelector('#languageSelect'),
  lead: document.querySelector('#heroLead'), searchTitle: document.querySelector('#searchTitle'),
  consentText: document.querySelector('#consentText'), submitText: document.querySelector('#submitText'),
  submit: document.querySelector('#submitButton'), status: document.querySelector('#status'),
  quick: document.querySelector('#quickQueries'), results: document.querySelector('#resultsSection'),
  resultsTitle: document.querySelector('#resultsTitle'), message: document.querySelector('#resultMessage'),
  cards: document.querySelector('#resultCards'), turnstile: document.querySelector('#turnstileContainer'),
  install: document.querySelector('#installButton')
};

let turnstileWidget = null;
let installPrompt = null;
const sessionId = getSessionId();

function getSessionId() {
  const existing = localStorage.getItem('p_gate_session_id');
  if (existing && /^[A-Za-z0-9_-]{16,100}$/.test(existing)) return existing;
  const created = crypto.randomUUID().replaceAll('-', '');
  localStorage.setItem('p_gate_session_id', created);
  return created;
}

function consumePrivateLaunchContext() {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const initialQuery = String(fragment.get('q') || '').trim();
  if (initialQuery.length >= 2 && initialQuery.length <= 200) elements.query.value = initialQuery;
  if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
}

function setLanguage(language) {
  const selected = copy[language] || copy.JA;
  document.documentElement.lang = language === 'JA' ? 'ja' : language.toLowerCase();
  elements.lead.textContent = selected.lead;
  elements.searchTitle.textContent = selected.title;
  elements.query.placeholder = selected.placeholder;
  elements.consentText.textContent = selected.consent;
  elements.submitText.textContent = selected.submit;
  elements.resultsTitle.textContent = selected.results;
  elements.quick.replaceChildren(...selected.examples.map((example) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'chip'; button.textContent = example;
    button.addEventListener('click', () => { elements.query.value = example; elements.query.focus(); });
    return button;
  }));
}

function textElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(text || '');
  return node;
}

function renderResults(result) {
  const selected = copy[elements.language.value] || copy.JA;
  elements.results.classList.remove('hidden');
  elements.message.textContent = result.message || '';
  const cards = (result.candidates || []).map((candidate) => {
    const card = document.createElement('article'); card.className = 'product-card';
    card.append(textElement('span', 'rank', `NO. ${candidate.rank}`));
    if (candidate.image) {
      const image = document.createElement('img'); image.className = 'product-image';
      image.src = candidate.image; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      card.append(image);
    }
    card.append(textElement('h3', '', candidate.display_name || candidate.product_name || candidate.asin));
    if (candidate.description) card.append(textElement('p', '', candidate.description));
    const terms = candidate.evidence?.matched_terms || [];
    if (terms.length) card.append(textElement('div', 'evidence', `Match: ${terms.slice(0, 4).join(' / ')}`));
    if (candidate.tracking_url) {
      const link = document.createElement('a'); link.className = 'buy-link';
      link.href = candidate.tracking_url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = selected.buy; card.append(link);
    }
    return card;
  });
  elements.cards.replaceChildren(...cards);
  elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function initializeTurnstile() {
  const config = await fetch('/api/config', { cache: 'no-store' }).then((response) => response.json());
  if (!config.turnstile_site_key) throw new Error('TURNSTILE_NOT_CONFIGURED');
  for (let count = 0; count < 100 && !window.turnstile; count += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!window.turnstile) throw new Error('TURNSTILE_UNAVAILABLE');
  turnstileWidget = window.turnstile.render(elements.turnstile, {
    sitekey: config.turnstile_site_key, theme: 'light', size: 'flexible'
  });
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = copy[elements.language.value] || copy.JA;
  elements.status.className = 'status'; elements.status.textContent = selected.loading;
  elements.submit.disabled = true;
  try {
    const token = window.turnstile?.getResponse(turnstileWidget) || '';
    const response = await fetch('/api/knowledge', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: elements.query.value, consent: elements.consent.checked, session_id: sessionId, turnstile_token: token })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'SEARCH_FAILED');
    renderResults(payload.result); elements.status.textContent = '';
  } catch (error) {
    elements.status.className = 'status error'; elements.status.textContent = selected.error;
  } finally {
    elements.submit.disabled = false;
    if (turnstileWidget !== null) window.turnstile?.reset(turnstileWidget);
  }
});

elements.language.addEventListener('change', () => setLanguage(elements.language.value));
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); installPrompt = event; elements.install.classList.remove('hidden');
});
elements.install.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt(); installPrompt = null; elements.install.classList.add('hidden');
});

setLanguage('JA');
consumePrivateLaunchContext();
initializeTurnstile().catch(() => {
  elements.status.className = 'status error';
  elements.status.textContent = 'セキュリティ確認を読み込めません。ページを再読み込みしてください。';
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js');
