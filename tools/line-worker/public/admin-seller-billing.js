// 2026-09-04 セラー請求（前払い・Stripe）管理画面。
const status = document.querySelector('#billingStatus');
const result = document.querySelector('#billingResult');
const table = document.querySelector('#billingAccounts');
const form = document.querySelector('#billingForm');
const yen = (value) => `${Number(value || 0).toLocaleString('ja-JP')}円`;
const when = (value) => value ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function link(href, label) { const a = el('a', label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }

async function load() {
  status.textContent = '確認しています。';
  try {
    const response = await fetch('/api/admin/seller-billing/accounts', { cache: 'no-store' });
    if (response.status === 401) return location.replace('/admin-login');
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'LOAD_FAILED');
    const stripe = payload.stripe || {};
    status.textContent = `Stripe: ${stripe.configured ? `接続済み（${stripe.mode}）` : '未接続'} / Webhook: ${stripe.webhook_configured ? '設定済み' : '未設定'} / ${payload.accounts.length}件`;
    const t = el('table'); const head = el('thead'); const hr = el('tr');
    ['事業者', 'プラン', '支払い', '状態', '月額', '残高', '登録', 'seller_key'].forEach((h) => hr.append(el('th', h))); head.append(hr);
    const body = el('tbody');
    for (const a of payload.accounts) {
      const tr = el('tr');
      tr.append(el('td', `${a.account_name}\n${a.contact_email}`), el('td', a.plan === 'BUSINESS' ? 'Business' : '無料'),
        el('td', a.payment_preference === 'BANK_TRANSFER' ? '銀行振込' : 'カード'), el('td', `${a.status} / 財布 ${a.wallet_status || '-'}`),
        el('td', a.subscription_status && a.subscription_status !== 'NONE' ? `${a.subscription_status}${a.trial_end_at ? `（trial〜${a.trial_end_at.slice(0, 10)}）` : ''}` : '未登録'),
        el('td', yen(a.available_jpy)), el('td', when(a.created_at)), el('td', a.seller_key));
      body.append(tr);
    }
    t.append(head, body); table.replaceChildren(payload.accounts.length ? t : el('p', 'まだ登録がありません。'));
  } catch (error) { status.textContent = `取得できません：${error.message}`; }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const seller_ids = String(data.get('seller_ids') || '').split('\n').map((line) => line.split(',').map((v) => v.trim())).filter((p) => p.length === 2 && p[0] && p[1]).map(([tenant, seller_id]) => ({ tenant, seller_id }));
  const payload = {
    account_name: data.get('account_name'), contact_email: data.get('contact_email'), plan: data.get('plan'),
    payment_preference: data.get('payment_preference'), tenants: String(data.get('tenants') || '').split(',').map((v) => v.trim()).filter(Boolean),
    seller_ids, ...(data.get('seller_key') ? { seller_key: String(data.get('seller_key')).trim() } : {})
  };
  const button = form.querySelector('button'); button.disabled = true; result.textContent = '登録しています…';
  try {
    const response = await fetch('/api/admin/seller-billing/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const out = await response.json();
    if (!response.ok || out.ok !== true) throw new Error(out.error || 'REGISTER_FAILED');
    const box = document.createDocumentFragment();
    box.append(el('p', `登録しました: ${out.account.account_name}（${out.account.plan}） seller_key=${out.account.seller_key}。案内メール: ${out.emailed ? '送信済み' : '未送信（RESEND未設定 or 失敗）'}`));
    if (out.links?.subscription?.url) { const p = el('p', 'Business 月額のお支払い方法登録（カード）: '); p.append(link(out.links.subscription.url, out.links.subscription.url)); box.append(p); }
    if (out.links?.subscription?.mode === 'bank_transfer') box.append(el('p', `銀行振込の月額を作成しました（subscription ${out.links.subscription.subscription_id}）。請求書は Stripe からメールされます。`));
    if (out.links?.topup?.url) { const p = el('p', '送客料の前払いチャージ（10,000円）: '); p.append(link(out.links.topup.url, out.links.topup.url)); box.append(p); }
    if (out.warnings?.length) box.append(el('p', `注意: ${out.warnings.join(' / ')}`));
    result.replaceChildren(box); form.reset(); await load();
  } catch (error) { result.textContent = `登録できません：${error.message}`; }
  finally { button.disabled = false; }
});
document.querySelector('#refreshBilling').addEventListener('click', load);
document.querySelector('#adminLogout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); location.replace('/admin-login'); });
load();
