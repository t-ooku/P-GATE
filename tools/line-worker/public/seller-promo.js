// 2026-10-03 HOSHILU Seller「AI販促担当」契約者画面「今週のサポート」。
// AI が作った文字列は必ず textContent で入れる（innerHTML を使わない）。
const list = document.getElementById('sellerPromoList');
const status = document.getElementById('sellerPromoStatus');
const autoToggle = document.getElementById('sellerPromoAuto');

const TYPE_LABEL = { ARTICLE: '記事', SNS: 'SNS原稿', IMPROVEMENT: '商品ページの直し案', IMAGE: '画像', REPORT: '月次レポート' };
const STATUS_LABEL = {
  QA_PASSED: '確認待ち', APPROVED: '承認済み', REJECTED: '差し戻し済み', PUBLISHED: '公開済み', CONFIRMING: '公開を確認中',
  DELIVERED: '納品済み', PUBLISH_FAILED: '公開に失敗（担当が確認します）', DRAFT: '作成中'
};
const REJECT_REASONS = [['FACT_WRONG', '事実が違う'], ['WORDING', '言い回し'], ['WRONG_PRODUCT', '商品が違う'], ['OTHER', 'その他']];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function say(message) { if (status) status.textContent = message; }

async function api(path, init = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || `HTTP_${response.status}`);
  return body;
}

function preview(item) {
  const p = item.payload || {};
  const box = el('div', { class: 'seller-panel' });
  if (item.type === 'ARTICLE') {
    box.append(el('h4', { text: p.title || '' }), el('p', { text: p.lead || '' }));
    for (const section of p.sections || []) box.append(el('h5', { text: section.h2 || '' }), el('p', { text: section.body_md || '' }));
    if ((p.faq || []).length) {
      box.append(el('h5', { text: 'よくある質問' }));
      for (const f of p.faq) box.append(el('p', { text: `Q. ${f.q}` }), el('p', { text: `A. ${f.a}` }));
    }
  } else if (item.type === 'SNS') {
    (p.posts || []).forEach((post, index) => {
      box.append(el('h5', { text: `${index + 1}本目: ${post.theme || ''}` }));
      for (const [key, label] of [['instagram', 'Instagram'], ['x', 'X'], ['threads', 'Threads']]) {
        box.append(el('p', { class: 'data-note', text: label }), el('p', { text: post.variants?.[key] || '' }));
      }
      if (post.image_brief) box.append(el('p', { class: 'data-note', text: `画像の文字: ${post.image_brief.headline || ''} ／ ${post.image_brief.sub || ''}` }));
    });
  } else if (item.type === 'IMPROVEMENT') {
    box.append(el('p', { text: `気づいたこと: ${p.issue || ''}` }), el('p', { class: 'data-note', text: '今の説明' }), el('p', { text: p.before || '' }),
      el('p', { class: 'data-note', text: '足す文章' }), el('p', { text: p.after_md || '' }));
  } else if (item.type === 'REPORT') {
    box.append(el('p', { text: `公開・納品: ${p.published_count ?? '計測不能'}件 ／ 承認までの平均日数: ${p.approval_days_avg ?? '計測不能'}` }),
      el('p', { text: `HOSHILU 内の保存: ${p.hoshilu?.saves ?? '計測不能'} ／ 通知: ${p.hoshilu?.notifications ?? '計測不能'} ／ 送客: ${p.hoshilu?.referrals ?? '計測不能'}` }),
      el('p', { text: `検索（Google）からの流入: ${p.google_traffic ?? '計測不能'}` }));
    for (const proposal of p.proposals || []) box.append(el('p', { text: `来月の提案: ${proposal}` }));
  }
  return box;
}

function actions(item, profile) {
  const wrap = el('div', { class: 'priority-actions' });
  if (item.status === 'QA_PASSED') {
    const approve = el('button', { type: 'button', class: 'primary-button', text: '承認する' });
    approve.addEventListener('click', () => act(item, 'approve', {}));
    const reason = el('select', { 'aria-label': '差し戻しの理由' });
    for (const [value, label] of REJECT_REASONS) reason.append(el('option', { value, text: label }));
    const note = el('input', { type: 'text', maxlength: '300', placeholder: 'ひとこと（任意）' });
    const reject = el('button', { type: 'button', class: 'ghost-button', text: '差し戻す' });
    reject.addEventListener('click', () => act(item, 'reject', { reason: reason.value, note: note.value }));
    wrap.append(approve, reason, note, reject);
  }
  if (item.type === 'ARTICLE' && profile?.publish_target === 'RAKUTEN_GOLD_DELIVERY' && ['APPROVED', 'DELIVERED'].includes(item.status)) {
    wrap.append(el('a', { class: 'ghost-button', href: `/api/seller-promo/deliverables/${item.id}/gold.zip`, text: '楽天GOLD用HTML（ZIP）をダウンロード' }));
  }
  if (item.published_url) wrap.append(el('a', { href: item.published_url, rel: 'noopener', target: '_blank', text: '公開ページを開く' }));
  return wrap;
}

async function act(item, verb, body) {
  try {
    say('送信しています…');
    await api(`/api/seller-promo/deliverables/${item.id}/${verb}`, { method: 'POST', body: JSON.stringify(body) });
    say(verb === 'approve' ? '承認しました。' : '差し戻しました。次の版で直します。');
    await load();
  } catch (error) {
    say(`できませんでした（${error.message}）。`);
  }
}

async function load() {
  if (!list) return;
  try {
    const data = await api('/api/seller-promo/deliverables');
    list.replaceChildren();
    if (!data.enrolled) { list.append(el('p', { class: 'metric-help', text: 'このアカウントでは、まだ週次のサポートを始めていません。' })); return; }
    if (autoToggle) autoToggle.checked = data.profile?.approval_mode === 'AUTO';
    if (!data.deliverables.length) { list.append(el('p', { class: 'metric-help', text: '今週の分はまだできていません。できたらメールでお知らせします。' })); return; }
    // 同じ週・種類は最新の版だけ見せる。
    const latest = new Map();
    for (const item of data.deliverables) {
      const key = `${item.week_key}:${item.type}`;
      if (!latest.has(key) || latest.get(key).version < item.version) latest.set(key, item);
    }
    for (const item of latest.values()) {
      list.append(el('article', { class: 'auth-card' },
        el('p', { class: 'eyebrow', text: `${item.week_key} ／ ${TYPE_LABEL[item.type] || item.type}` }),
        el('p', { text: `状態: ${STATUS_LABEL[item.status] || item.status}${item.rejected_reason ? `（${item.rejected_reason}）` : ''}` }),
        preview(item), actions(item, data.profile)));
    }
  } catch (error) {
    list.replaceChildren(el('p', { class: 'metric-help', text: `読み込めませんでした（${error.message}）。` }));
  }
}

autoToggle?.addEventListener('change', async () => {
  const enabled = autoToggle.checked;
  if (enabled && !window.confirm('検査に通った記事・原稿を、確認なしで公開・納品します。よろしいですか？')) { autoToggle.checked = false; return; }
  try {
    await api('/api/seller-promo/auto-publish', { method: 'POST', body: JSON.stringify({ enabled }) });
    say(enabled ? '自動公開を許可しました。' : '自動公開をやめました。');
  } catch (error) {
    autoToggle.checked = !enabled;
    say(`切り替えられませんでした（${error.message}）。`);
  }
});

load();
