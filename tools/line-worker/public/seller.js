const sessionResponse = await fetch('/api/seller/session', { cache: 'no-store' });
if (!sessionResponse.ok) location.replace('/seller-login.html');

const status = document.querySelector('#sellerPriorityStatus');
const buttons = () => [...document.querySelectorAll(
  '[data-priority-action],#sellerPriorityRuleForm button,#sellerInventoryRuleForm button,#sellerAiRuleForm button'
)];

function setBusy(busy) {
  buttons().forEach((button) => { button.disabled = busy; });
}

function showStatus(message, error = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

async function updatePriority(payload) {
  setBusy(true);
  showStatus('保存しています…');
  try {
    const response = await fetch('/api/seller/priority-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error(result.error || '保存できませんでした');
    showStatus('保存しました。画面を更新します。');
    location.reload();
  } catch (error) {
    showStatus(`保存できませんでした（${String(error.message || error)}）`, true);
    setBusy(false);
  }
}

document.querySelectorAll('[data-priority-action]').forEach((button) => {
  button.addEventListener('click', () => updatePriority({
    action: button.dataset.priorityAction,
    tenant: button.dataset.tenant,
    rule_id: button.dataset.ruleId,
    active: button.dataset.active
  }));
});

document.querySelector('#sellerPriorityRuleForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  updatePriority({
    action: 'UPSERT_RULE', tenant: data.get('tenant'),
    scope_type: data.get('scope_type'), scope_value: data.get('scope_value'), active: true
  });
});

document.querySelector('#sellerInventoryRuleForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  updatePriority({
    action: 'UPSERT_RULE', tenant: data.get('tenant'),
    scope_type: 'INVENTORY_MIN', scope_value: data.get('scope_value'), active: true
  });
});

document.querySelector('#sellerAiRuleForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  updatePriority({
    action: 'UPSERT_RULE', tenant: data.get('tenant'),
    scope_type: 'AI_RECOMMENDED', scope_value: '*', active: data.get('active') === 'on'
  });
});

document.querySelector('#sellerLogout')?.addEventListener('click', async () => {
  await fetch('/api/seller/logout', { method: 'POST' });
  location.replace('/');
});


// 2026-09-04 前払い請求・決済（Stripe）。残高・無料枠・月額の状態を出し、
// チャージ／月額登録／お支払い管理は Stripe の画面へ移動する。
const billingStatus = document.querySelector('#sellerBillingStatus');
const billingField = (name) => document.querySelector(`[data-billing="${name}"]`);
const yenText = (value) => `${Number(value || 0).toLocaleString('ja-JP')}円`;
function showBillingStatus(message, error = false) {
  if (!billingStatus) return;
  billingStatus.textContent = message;
  billingStatus.classList.toggle('is-error', error);
}
async function billingPost(path, payload = {}) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error(result.error || 'BILLING_ERROR');
  return result;
}
async function loadBilling() {
  if (!document.querySelector('#sellerBillingSummary')) return;
  try {
    const response = await fetch('/api/seller/billing', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'BILLING_ERROR');
    billingField('available').textContent = yenText(data.wallet?.available_jpy);
    billingField('wallet-note').textContent = data.account
      ? `状態 ${data.wallet?.status || '-'}${data.wallet?.updated_at ? ` / 更新 ${data.wallet.updated_at.slice(0, 10)}` : ''}`
      : '請求アカウントは未登録です（管理者が登録すると利用できます）';
    if (data.allowance) {
      billingField('allowance').textContent = `残り ${yenText(data.allowance.remaining_jpy)}`;
      billingField('allowance-note').textContent = `${data.allowance.month}: ${yenText(data.allowance.consumed_jpy)} / ${yenText(data.allowance.granted_jpy)} 消化`;
    } else {
      billingField('allowance').textContent = '対象外';
      billingField('allowance-note').textContent = '無料プランには無料枠はありません';
    }
    const plan = data.account?.plan === 'BUSINESS' ? 'Business 9,800円/月' : '無料プラン 0円/月';
    billingField('plan').textContent = data.account ? plan : '未登録';
    const trial = data.account?.trial_end_at ? `トライアル終了 ${data.account.trial_end_at.slice(0, 10)}` : '';
    billingField('plan-note').textContent = data.account
      ? `${data.account.status} / ${data.account.payment_preference === 'BANK_TRANSFER' ? '銀行振込' : 'カード'}${data.account.subscription_status && data.account.subscription_status !== 'NONE' ? ` / ${data.account.subscription_status}` : ''}${trial ? ` / ${trial}` : ''}`
      : '';
    const subscribeButton = document.querySelector('[data-billing-action="subscribe"]');
    if (subscribeButton) subscribeButton.hidden = !(data.account?.plan === 'BUSINESS' && !data.account?.has_subscription);
    const auto = document.querySelector('#sellerAutoRecharge');
    if (auto) {
      auto.checked = Boolean(data.account?.auto_recharge_enabled);
      auto.disabled = !data.account || data.account.payment_preference !== 'CARD';
      billingField('threshold').textContent = Number(data.account?.auto_recharge_threshold_jpy || 2000).toLocaleString('ja-JP');
      billingField('auto-amount').textContent = Number(data.account?.auto_recharge_amount_jpy || 10000).toLocaleString('ja-JP');
    }
    document.querySelectorAll('[data-billing-action]').forEach((button) => {
      button.disabled = !data.account || !data.stripe?.configured;
    });
    if (!data.stripe?.configured) showBillingStatus('決済（Stripe）は接続前です。チャージ・月額登録はまだ使えません。');
    const flag = new URLSearchParams(location.search).get('billing');
    if (flag === 'topup_done') showBillingStatus('お支払いを受け付けました。入金確認後、残高に反映されます（カードは即時、銀行振込は着金後）。');
    if (flag === 'subscribed') showBillingStatus('Business の月額のお支払い方法を登録しました。');
    if (flag === 'cancelled') showBillingStatus('お支払い手続きを中止しました。');
  } catch (error) {
    showBillingStatus(`残高を読み込めませんでした（${String(error.message || error)}）`, true);
  }
}
document.querySelectorAll('[data-billing-action]').forEach((button) => {
  button.addEventListener('click', async () => {
    const action = button.dataset.billingAction;
    button.disabled = true;
    showBillingStatus('Stripe の画面を準備しています…');
    try {
      const path = { topup: '/api/seller/billing/topup', subscribe: '/api/seller/billing/subscribe', portal: '/api/seller/billing/portal' }[action];
      const payload = action === 'topup' ? { amount_jpy: Number(document.querySelector('#sellerTopupAmount')?.value || 10000) } : {};
      const result = await billingPost(path, payload);
      if (result.url) { location.assign(result.url); return; }
      if (result.mode === 'bank_transfer') showBillingStatus('銀行振込用の請求書をメールでお送りしました。トライアル中は0円です。');
      else if (result.mode === 'existing') showBillingStatus('月額はすでに登録済みです。');
      await loadBilling();
    } catch (error) {
      showBillingStatus(`手続きを開始できませんでした（${String(error.message || error)}）`, true);
    } finally {
      button.disabled = false;
    }
  });
});
document.querySelector('#sellerAutoRecharge')?.addEventListener('change', async (event) => {
  try {
    await billingPost('/api/seller/billing/auto-recharge', { enabled: event.currentTarget.checked });
    showBillingStatus(event.currentTarget.checked ? '自動チャージを有効にしました。' : '自動チャージを無効にしました。');
  } catch (error) {
    showBillingStatus(`自動チャージの設定を保存できませんでした（${String(error.message || error)}）`, true);
    await loadBilling();
  }
});
loadBilling();

// 2026-09-04 ショップページ・クーポン（Business）。
const shopStatus = document.querySelector('#sellerShopStatus');
function showShopStatus(message, error = false) {
  if (!shopStatus) return;
  shopStatus.textContent = message;
  shopStatus.classList.toggle('is-error', error);
}
async function shopRequest(path, method = 'GET', payload = null) {
  const response = await fetch(path, {
    method, cache: 'no-store', headers: payload ? { 'content-type': 'application/json' } : {}, body: payload ? JSON.stringify(payload) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error(result.error || `SHOP_ERROR_${response.status}`);
  return result;
}
function renderShop(data) {
  const shopUrl = document.querySelector('#sellerShopUrl');
  const form = document.querySelector('#sellerShopForm');
  if (!form) return;
  const kpi = (name) => document.querySelector(`[data-shop-kpi="${name}"]`);
  kpi('followers').textContent = String(data.kpi?.followers ?? 0);
  kpi('views').textContent = String(data.kpi?.views_30d ?? 0);
  kpi('coupons').textContent = String((data.coupons || []).filter((c) => c.live).length);
  if (data.shop) {
    const link = document.createElement('a'); link.href = data.shop.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = `${location.origin}${data.shop.url}`;
    shopUrl.replaceChildren(link);
    for (const name of ['shop_name', 'slug', 'tagline', 'intro', 'logo_url', 'website_url', 'business_name', 'business_address']) if (form.elements[name]) form.elements[name].value = data.shop[name] || '';
    form.elements.hidden.checked = data.shop.status === 'HIDDEN';
  }
  const list = document.querySelector('#sellerCouponList');
  list.replaceChildren();
  for (const coupon of data.coupons || []) {
    const item = document.createElement('article'); item.className = 'seller-panel';
    const title = document.createElement('strong'); title.textContent = `${coupon.title}${coupon.discount_text ? `（${coupon.discount_text}）` : ''}`;
    const meta = document.createElement('span');
    meta.textContent = [coupon.code ? `コード ${coupon.code}` : '', coupon.marketplace || '共通', coupon.ends_at ? `${coupon.ends_at} まで` : '', coupon.hoshilu_only ? 'HOSHILU限定' : '', coupon.status === 'ENDED' ? '終了' : coupon.live ? '公開中' : '期間外'].filter(Boolean).join(' ・ ');
    item.append(title, meta);
    if (coupon.status !== 'ENDED') {
      const end = document.createElement('button'); end.type = 'button'; end.className = 'ghost-button'; end.textContent = '終了する';
      end.addEventListener('click', async () => {
        end.disabled = true;
        try { renderShop(await shopRequest(`/api/seller/shop/coupons/${encodeURIComponent(coupon.coupon_id)}`, 'DELETE', {})); showShopStatus('クーポンを終了しました。'); }
        catch (error) { showShopStatus(`終了できませんでした（${error.message}）`, true); end.disabled = false; }
      });
      item.append(end);
    }
    list.append(item);
  }
  if (data.entitled === false) {
    showShopStatus(data.reason === 'BUSINESS_PLAN_REQUIRED' ? 'ショップページは Business プランで使えます。' : '請求アカウントの登録後に使えます（HOSHILU 側で登録します）。');
    document.querySelectorAll('#sellerShopForm button, #sellerCouponForm button').forEach((button) => { button.disabled = true; });
  }
}
async function loadShop() {
  if (!document.querySelector('#sellerShopForm')) return;
  try { renderShop(await shopRequest('/api/seller/shop')); }
  catch (error) { showShopStatus(`ショップ情報を読み込めませんでした（${error.message}）`, true); }
}
document.querySelector('#sellerShopForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(['shop_name', 'slug', 'tagline', 'intro', 'logo_url', 'website_url', 'business_name', 'business_address'].map((name) => [name, form.elements[name].value]));
  payload.status = form.elements.hidden.checked ? 'HIDDEN' : 'ACTIVE';
  showShopStatus('保存しています…');
  try { renderShop(await shopRequest('/api/seller/shop', 'PUT', payload)); showShopStatus('ショップページを保存しました。'); }
  catch (error) { showShopStatus(`保存できませんでした（${error.message}）`, true); }
});
document.querySelector('#sellerCouponForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(['title', 'discount_text', 'code', 'marketplace', 'landing_url', 'ends_at', 'terms'].map((name) => [name, form.elements[name].value]));
  payload.hoshilu_only = form.elements.hoshilu_only.checked;
  showShopStatus('クーポンを追加しています…');
  try { renderShop(await shopRequest('/api/seller/shop/coupons', 'POST', payload)); form.reset(); showShopStatus('クーポンを追加しました。'); }
  catch (error) { showShopStatus(`追加できませんでした（${error.message}）`, true); }
});
loadShop();

// 2026-09-17 SHOP強化 P0: 「HOSHILUで今探されているもの」（探し中需要）と「この需要に商品を登録」
function showDemandStatus(message, error = false) {
  const node = document.querySelector('#sellerDemandStatus');
  if (!node) return;
  node.textContent = message; node.classList.toggle('error', error);
}
function renderDemand(data) {
  const rows = document.querySelector('#sellerDemandRows');
  const select = document.querySelector('#sellerDemandOfferForm select[name="demand_key"]');
  if (!rows) return;
  const kpi = (name) => document.querySelector(`[data-demand-kpi="${name}"]`);
  kpi('searches').textContent = String(data.totals?.searches ?? 0);
  kpi('zero').textContent = String(data.totals?.zero_results ?? 0);
  kpi('near').textContent = String(data.totals?.near_only ?? 0);
  rows.replaceChildren();
  if (select) { select.replaceChildren(); const blank = document.createElement('option'); blank.value = ''; blank.textContent = '選んでください'; select.append(blank); }
  const items = Array.isArray(data.items) ? data.items : [];
  // 2026-09-17 第2指示書: 5人未満の需要は件数だけ（検索文は Seller に渡さない）
  const note = document.querySelector('#sellerDemandNote');
  const minPeople = Number(data.min_people) || 5;
  const below = data.below_threshold || { groups: 0, people: 0 };
  if (note) note.textContent = below.groups ? `ほかに ${below.groups}件の需要（のべ ${below.people}人）が集計待ちです。同じ条件を ${minPeople}人以上が探すと表示されます。` : `同じ条件を ${minPeople}人以上が探している需要だけを表示します。`;
  if (!items.length) {
    const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.textContent = below.groups ? `集計待ちです。同じ条件を ${minPeople}人以上が探すと、ここに並びます。` : 'まだありません。ユーザーが横断検索で「ホシっとく」を押し、同じ条件が集まると、ここに並びます。'; tr.append(td); rows.append(tr);
    return;
  }
  for (const item of items) {
    const tr = document.createElement('tr');
    const cells = [
      item.query,
      `${item.people}人`,
      `${item.searches_30d}回（0件 ${item.zero_results_30d}・近似のみ ${item.near_only_30d}）`,
      item.own_exact === null ? '未判定' : `一致 ${item.own_exact}・近い ${item.own_near}`,
      `${item.state}${item.matched ? `（お知らせ済み ${item.matched}）` : ''}${item.offer ? `・登録済み: ${item.offer.level === 'EXACT' ? '一致' : item.offer.level === 'NEAR' ? '近い' : '不一致'}` : ''}`
    ];
    for (const value of cells) { const td = document.createElement('td'); td.textContent = value; td.style.whiteSpace = 'pre-line'; tr.append(td); }
    const action = document.createElement('td');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost-button'; button.textContent = 'この需要に商品を登録';
    button.addEventListener('click', () => { if (select) { select.value = item.demand_key; select.closest('form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    action.append(button); tr.append(action);
    rows.append(tr);
    if (select) { const option = document.createElement('option'); option.value = item.demand_key; option.textContent = `${item.query}（${item.people}人）`; select.append(option); }
  }
}
async function loadDemand() {
  if (!document.querySelector('#sellerDemandRows')) return;
  try { renderDemand(await shopRequest('/api/seller/shop/demand')); }
  catch (error) { showDemandStatus(error.message === 'BUSINESS_PLAN_REQUIRED' ? '探し中需要は Business プランで確認できます。' : `需要を読み込めませんでした（${error.message}）`, true); }
}
document.querySelector('#sellerDemandOfferForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { demand_key: form.elements.demand_key.value, asin: form.elements.asin.value, product_url: form.elements.product_url.value };
  showDemandStatus('HOSHILU が条件との一致を判定しています…');
  try {
    const data = await shopRequest('/api/seller/shop/demand/offers', 'POST', payload);
    renderDemand(data);
    const offer = data.offer || {};
    const label = offer.level === 'EXACT' ? '条件に一致' : offer.level === 'NEAR' ? '近い商品' : '一致しない';
    showDemandStatus(`判定: ${label}（✓ ${(offer.matched || []).join('・') || 'なし'} ／ △ ${(offer.unmatched || []).join('・') || 'なし'}）。${offer.notified ? `${offer.notified}人にお知らせしました。` : offer.level === 'NONE' ? '商品名に条件が明記されていないため、お知らせはしていません。' : 'お知らせ対象の会員はいませんでした。'}`, offer.level === 'NONE');
    form.reset();
  } catch (error) {
    const messages = { PRODUCT_NOT_IN_YOUR_SHOP: 'その ASIN／URL は、あなたのショップの商品データに見つかりません。', ASIN_OR_URL_REQUIRED: 'ASIN か商品URL を入れてください。', DEMAND_NOT_FOUND: '需要が見つかりません。' };
    showDemandStatus(messages[error.message] || `登録できませんでした（${error.message}）`, true);
  }
});
loadDemand();
