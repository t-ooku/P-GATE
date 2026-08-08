// v4.3 指示書 Priority 3: AI最安比較のUI。
//
// app.js の productCard() から window.HoshiluPriceComparison.attach(card,
// candidate) を呼んでもらう(ai-search-ui.mjsのHoshiluSearchブリッジと同じ
// パターン)。ここでDOMだけを見て後付けする方式(MutationObserver)にしない
// のは、実オファー(candidate.offers)というJSオブジェクトの生データが必要
// で、DOMからは復元できないため。

const DEFAULT_DIRECT_MARKETPLACES = ['LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'QOO10_JP', 'ZOZOTOWN_JP'];

const copy = {
  JA: {
    button: 'AI最安比較', title: 'AI最安比較', loading: '比較しています…', error: '比較に失敗しました。もう一度お試しください。', retry: 'もう一度試す', close: '閉じる',
    realLabel: '実価格', estimateLabel: 'AI推定', unavailableLabel: '価格推定できません', search: '検索', empty: '比較できる情報がありませんでした。'
  },
  EN: {
    button: 'AI Price Compare', title: 'AI Price Compare', loading: 'Comparing…', error: 'Comparison failed. Please try again.', retry: 'Try again', close: 'Close',
    realLabel: 'Real price', estimateLabel: 'AI estimate', unavailableLabel: 'Cannot estimate', search: 'Search', empty: 'No comparison data available.'
  },
  ZH: {
    button: 'AI比价', title: 'AI比价', loading: '正在比较…', error: '比较失败，请重试。', retry: '重试', close: '关闭',
    realLabel: '实际价格', estimateLabel: 'AI推测', unavailableLabel: '无法推测价格', search: '搜索', empty: '没有可比较的信息。'
  },
  KO: {
    button: 'AI 최저가 비교', title: 'AI 최저가 비교', loading: '비교하고 있습니다…', error: '비교에 실패했습니다. 다시 시도해 주세요.', retry: '다시 시도', close: '닫기',
    realLabel: '실제 가격', estimateLabel: 'AI 추정', unavailableLabel: '가격 추정 불가', search: '검색', empty: '비교할 정보가 없습니다.'
  }
};

function currentLanguage() {
  return document.querySelector('[data-language-select]')?.value || 'JA';
}

function textEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function marketplaceLabel(marketplace) {
  return {LOFT_JP:'ロフト',HANDS_JP:'ハンズ',MATSUKIYO_JP:'マツキヨ',COSME_JP:'@cosme',QOO10_JP:'Qoo10',ZOZOTOWN_JP:'ZOZOTOWN',AMAZON_JP:'Amazon',RAKUTEN_JP:'楽天市場',YAHOO_JP:'Yahoo!ショッピング'}[marketplace] || String(marketplace || '').replace(/_JP$/, '');
}

async function fetchComparison(candidate, language) {
  const auth = window.HoshiluChatAuth;
  const token = await (auth?.requestToken?.() ?? '');
  if (!token) throw new Error('TURNSTILE_TOKEN_UNAVAILABLE');
  const title = String(candidate.display_name || candidate.product_name || candidate.asin || '').slice(0, 200);
  const response = await fetch('/api/price-comparison', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      product: { title, brand: candidate.manufacturer || '', category: '' },
      real_offers: Array.isArray(candidate.offers) ? candidate.offers : [],
      search_query: String(candidate.search_query || title).slice(0, 200),
      direct_marketplaces: DEFAULT_DIRECT_MARKETPLACES,
      language,
      session_id: auth?.sessionId || '',
      consent: true,
      turnstile_token: token
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'PRICE_COMPARISON_FAILED');
  return payload.result;
}

function renderRow(row, label, className) {
  const item = document.createElement('div');
  item.className = `price-compare-row ${className}`;
  item.append(textEl('span', 'price-compare-marketplace', marketplaceLabel(row.marketplace)));
  item.append(textEl('span', 'price-compare-badge', label));
  return item;
}

function appendSearchLink(item, row, t) {
  if (!row.search_url) return;
  const link = document.createElement('a');
  link.href = row.search_url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.className = 'price-compare-search-link'; link.textContent = t.search;
  if (row.search_query) link.title = `${marketplaceLabel(row.marketplace)}: ${row.search_query}`;
  item.append(link);
}

function renderComparison(container, result, t) {
  container.replaceChildren();
  if (!result.real.length && !result.ai_estimated.length && !result.unavailable.length) {
    container.append(textEl('p', 'price-compare-empty', t.empty));
    return;
  }
  for (const row of result.real) {
    const item = renderRow(row, t.realLabel, 'price-compare-row-real');
    item.append(textEl('strong', 'price-compare-amount', `¥${Number(row.total_cost).toLocaleString('ja-JP')}`));
    if (row.tracking_url) {
      const link = document.createElement('a');
      link.href = row.tracking_url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.className = 'price-compare-link'; link.textContent = marketplaceLabel(row.marketplace);
      item.append(link);
    }
    container.append(item);
  }
  for (const row of result.ai_estimated) {
    const item = renderRow(row, t.estimateLabel, 'price-compare-row-estimate');
    appendSearchLink(item, row, t);
    item.append(textEl('strong', 'price-compare-amount', `約¥${row.range_min.toLocaleString('ja-JP')}〜¥${row.range_max.toLocaleString('ja-JP')}`));
    if (row.confidence_label) item.append(textEl('span', 'price-compare-confidence', row.confidence_label));
    container.append(item);
  }
  for (const row of result.unavailable) {
    const item = renderRow(row, t.unavailableLabel, 'price-compare-row-unavailable');
    container.append(item);
  }
  if (result.cheapest_claim?.text) container.append(textEl('p', 'price-compare-claim price-compare-claim-real', result.cheapest_claim.text));
  if (result.hedged_claim?.text) container.append(textEl('p', 'price-compare-claim price-compare-claim-hedged', result.hedged_claim.text));
  if (result.disclaimer_required) container.append(textEl('p', 'price-compare-disclaimer', result.disclaimer_text));
}

function openComparisonDialog(candidate) {
  const language = currentLanguage();
  const t = copy[language] || copy.JA;
  const dialog = document.createElement('dialog');
  dialog.className = 'price-compare-dialog';
  const panel = document.createElement('div');
  panel.className = 'price-compare-dialog-card';
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'price-compare-dialog-close'; close.setAttribute('aria-label', t.close); close.textContent = '✕';
  close.addEventListener('click', () => dialog.close());
  const title = textEl('strong', '', t.title);
  const body = document.createElement('div');
  body.className = 'price-compare-body';
  panel.append(close, title, body);
  dialog.append(panel);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  function showError() {
    body.replaceChildren();
    body.append(textEl('p', 'price-compare-error', t.error));
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'price-compare-retry'; retry.textContent = t.retry;
    retry.addEventListener('click', load);
    body.append(retry);
  }

  async function load() {
    body.replaceChildren(textEl('p', 'price-compare-loading', t.loading));
    try {
      const result = await fetchComparison(candidate, language);
      renderComparison(body, result, t);
    } catch (error) {
      console.error('HOSHILU_PRICE_COMPARISON_FAILED', String(error?.message || error));
      showError();
    }
  }

  dialog.showModal();
  load();
}

function attach(card, candidate) {
  if (!card || card.querySelector('.ai-price-compare-button')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ai-price-compare-button';
  button.textContent = (copy[currentLanguage()] || copy.JA).button;
  button.addEventListener('click', () => openComparisonDialog(candidate));
  card.append(button);
}

window.HoshiluPriceComparison = { attach };
