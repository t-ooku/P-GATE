// 2026-09-04 Experience Layer（経験財）MVP — 総合実行指示書 §16–21。表示名は「口コミ」（2026-09-04 大隆さん指示）。
// 検索結果の商品カードに「HOSHILU使用感」を差し込む。app.js には手を入れず、
// 描画された .product-card を監視して後から足す（既存の検索・購入導線を壊さない）。
// 表示は「自立する 89%」のように短時間で判断できる形。投稿は会員ログインが必要。
const LANG = () => document.querySelector('#language')?.value || 'JA';
const COPY = {
  JA: { title: '口コミ', none: 'まだ口コミがありません。', post: '口コミを投稿する', edit: '自分の口コミを直す', again: 'また買いたい', count: (n) => `${n}件`, submit: '投稿する', cancel: '閉じる', login: '投稿には無料会員ログインが必要です（30秒）→', comment: 'ひとこと（任意・200字まで。個人情報は書かないでください）', buyAgain: 'また買いたい', saved: '口コミを投稿しました。ありがとうございます。', failed: '投稿できませんでした', scale: ['合わない', 'いまいち', 'ふつう', 'よい', 'とてもよい'], note: '実際に使った人の口コミだけを集計しています。モールの口コミは転載していません。' },
  EN: { title: 'Reviews', none: 'No reviews yet.', post: 'Write a review', edit: 'Edit my report', again: 'Would buy again', count: (n) => `${n}`, submit: 'Post', cancel: 'Close', login: 'Sign in as a free member to post (30 sec) →', comment: 'One line (optional, up to 200 chars, no personal data)', buyAgain: 'Would buy again', saved: 'Posted. Thank you.', failed: 'Could not post', scale: ['Poor', 'Meh', 'OK', 'Good', 'Great'], note: 'Only reports from members who used the product. No marketplace reviews are copied.' }
};
const copy = () => COPY[LANG()] || COPY.JA;
const queryText = () => String(document.querySelector('#query')?.value || '').slice(0, 200);
const pending = new Map();
let timer = null;

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

function renderSummary(block, summary) {
  const c = copy();
  block.replaceChildren();
  const head = el('div', 'experience-head');
  const button = el('button', 'experience-post', c.post); button.type = 'button';
  button.addEventListener('click', () => openForm(block, summary));
  head.append(el('strong', '', c.title), el('span', 'experience-count', summary.count ? c.count(summary.count) : c.none), button);
  block.append(head);
  if (summary.count) {
    const list = el('div', 'experience-axes');
    for (const axis of summary.axes.filter((a) => a.percent !== null).slice(0, 5)) {
      const row = el('div', 'experience-axis');
      const bar = el('span', 'experience-bar'); bar.style.setProperty('--p', `${axis.percent}%`);
      row.append(el('span', 'experience-label', axis.label), bar, el('b', '', `${axis.percent}%`));
      list.append(row);
    }
    if (summary.would_buy_again_percent !== null) {
      const row = el('div', 'experience-axis experience-again');
      const bar = el('span', 'experience-bar'); bar.style.setProperty('--p', `${summary.would_buy_again_percent}%`);
      row.append(el('span', 'experience-label', c.again), bar, el('b', '', `${summary.would_buy_again_percent}%`));
      list.append(row);
    }
    block.append(list);
    if (summary.comments?.length) {
      const quotes = el('div', 'experience-comments');
      for (const item of summary.comments) quotes.append(el('p', '', `「${item.text}」`));
      block.append(quotes);
    }
  }
}

function openForm(block, summary) {
  const c = copy();
  if (block.querySelector('.experience-form')) return;
  const form = el('form', 'experience-form');
  const axes = summary.axes.length ? summary.axes : [];
  for (const axis of axes) {
    const field = el('fieldset', 'experience-field');
    field.append(el('legend', '', axis.label));
    const scale = el('div', 'experience-scale');
    c.scale.forEach((label, index) => {
      const option = el('label', '');
      const input = document.createElement('input'); input.type = 'radio'; input.name = axis.key; input.value = String(index + 1);
      option.append(input, el('span', '', String(index + 1)));
      option.title = label;
      scale.append(option);
    });
    field.append(scale);
    form.append(field);
  }
  const again = el('label', 'experience-again-field');
  const againInput = document.createElement('input'); againInput.type = 'checkbox'; againInput.name = 'would_buy_again';
  again.append(againInput, el('span', '', c.buyAgain));
  form.append(again);
  const comment = document.createElement('textarea'); comment.name = 'comment'; comment.maxLength = 200; comment.rows = 2; comment.placeholder = c.comment;
  form.append(comment);
  const actions = el('div', 'experience-actions');
  const submit = el('button', 'experience-submit', c.submit); submit.type = 'submit';
  const cancel = el('button', 'experience-cancel', c.cancel); cancel.type = 'button';
  cancel.addEventListener('click', () => form.remove());
  actions.append(submit, cancel);
  const status = el('p', 'experience-status', c.note);
  form.append(actions, status);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const ratings = {};
    for (const axis of axes) { const v = Number(data.get(axis.key)); if (v >= 1 && v <= 5) ratings[axis.key] = v; }
    if (Object.keys(ratings).length < 2) { status.textContent = LANG() === 'JA' ? '2項目以上を選んでください。' : 'Rate at least two items.'; return; }
    submit.disabled = true; status.textContent = '…';
    try {
      const response = await fetch('/api/experience/report', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: summary.name, query: queryText(), ratings, would_buy_again: againInput.checked, comment: comment.value, locale: LANG() })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        status.replaceChildren();
        const link = el('a', 'experience-login', c.login);
        link.href = `/login.html?next=${encodeURIComponent('/#results')}`;
        status.append(link);
        submit.disabled = false;
        return;
      }
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'FAILED');
      document.dispatchEvent(new CustomEvent('hoshilu:experience-posted'));
      renderSummary(block, payload.summary);
      const done = el('p', 'experience-status experience-saved', c.saved);
      block.append(done);
    } catch (error) {
      status.textContent = `${c.failed}（${String(error.message || error)}）`;
      submit.disabled = false;
    }
  });
  block.append(form);
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function flush() {
  timer = null;
  const batch = [...pending.entries()].slice(0, 12);
  for (const [name] of batch) pending.delete(name);
  if (!batch.length) return;
  try {
    const response = await fetch('/api/experience/summaries', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: batch.map(([name]) => ({ name })), query: queryText(), locale: LANG() })
    });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error('SUMMARY_FAILED');
    for (const summary of payload.items || []) {
      const blocks = batch.find(([name]) => name === summary.name)?.[1] || [];
      for (const block of blocks) renderSummary(block, summary);
    }
  } catch {
    for (const [, blocks] of batch) for (const block of blocks) block.remove();
  }
  if (pending.size) timer = setTimeout(flush, 50);
}

function mount(card) {
  if (card.dataset.experienceMounted) return;
  const title = card.querySelector('h3')?.textContent?.trim();
  if (!title) return;
  card.dataset.experienceMounted = '1';
  const block = el('section', 'experience-block');
  block.setAttribute('aria-label', copy().title);
  // カードの末尾（スマホの2列グリッドでは両列をまたぐ全幅）。右列の順位・商品名・価格を押し下げない。
  card.append(block);
  if (!pending.has(title)) pending.set(title, []);
  pending.get(title).push(block);
  if (!timer) timer = setTimeout(flush, 80);
}

function scan(root = document) {
  root.querySelectorAll?.('.product-card:not([data-experience-mounted])').forEach(mount);
}
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) for (const node of mutation.addedNodes) {
    if (!(node instanceof Element)) continue;
    if (node.matches?.('.product-card')) mount(node); else scan(node);
  }
});
observer.observe(document.body, { childList: true, subtree: true });
scan();
