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
    const plan = data.account?.plan === 'BUSINESS' ? 'HOSHILU Seller 4,980円/月' : '無料プラン 0円/月';
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
// 2026-09-21 指示書 ⑭⑱: ダッシュボードの一番上に3つの需要を出し、そのまま商品登録へ送る。
// 数字は /api/seller/shop/demand の実データだけ。系統ごとに集計できていない場合は
// 「0人」と書かず「集計できていません」と出す（§30 架空件数は禁止）。
function demandNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function jpy(value) { return '¥' + Number(value).toLocaleString('ja-JP'); }
function demandLaneCard(title, lead, lane, renderItem) {
  const card = demandNode('article', 'demand-lane');
  card.append(demandNode('span', 'demand-lane-title', title));
  card.append(demandNode('p', 'demand-lane-lead', lead));
  if (!lane) {
    card.append(demandNode('p', 'demand-lane-note', 'いまこの需要は集計できていません。数字が出せるようになったら表示します。'));
    return card;
  }
  const items = Array.isArray(lane.items) ? lane.items : [];
  const minPeople = Number(lane.min_people) || 5;
  const below = lane.below_threshold || { groups: 0, people: 0 };
  if (!items.length) {
    card.append(demandNode('p', 'demand-lane-note', below.groups
      ? `集計待ちです。同じ需要が ${minPeople}人以上集まると、ここに出ます（いま ${below.groups}件）。`
      : `まだ公開できる需要がありません。${minPeople}人以上集まった需要だけを表示します。`));
    return card;
  }
  const list = demandNode('ul', 'demand-lane-list');
  for (const item of items.slice(0, 3)) list.append(renderItem(item));
  card.append(list);
  if (below.groups) card.append(demandNode('p', 'demand-lane-note', `ほかに ${below.groups}件が集計待ちです（${minPeople}人以上で表示）。`));
  return card;
}
function demandLaneItem(name, detail, action) {
  const row = demandNode('li', 'demand-lane-item');
  row.append(demandNode('strong', null, name));
  row.append(demandNode('span', null, detail));
  if (action) row.append(action);
  return row;
}
function demandOfferButton(demandKey) {
  const button = demandNode('button', 'compact-button', 'この需要に商品を登録');
  button.type = 'button';
  button.addEventListener('click', () => {
    const select = document.querySelector('#sellerDemandOfferForm select[name="demand_key"]');
    if (!select) return;
    select.value = demandKey;
    select.closest('form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  return button;
}
function demandLinkButton(text, href) {
  const link = demandNode('a', 'compact-button', text);
  link.href = href;
  return link;
}
function renderThreeDemands(data) {
  const host = document.querySelector('#sellerThreeDemands');
  if (!host) return;
  host.replaceChildren();
  // ①探し中: 自社で応えられるかを判定済みの需要（demand_key があるので、そのまま登録へ送れる）
  const searchingLane = data.searching
    ? { items: Array.isArray(data.items) ? data.items : [], min_people: data.min_people, below_threshold: data.below_threshold }
    : null;
  host.append(demandLaneCard('探し中', 'まだ見つかっていない「欲しい」です。条件に合う商品を登録すると、待っている人にお知らせが届きます。', searchingLane,
    (item) => demandLaneItem(item.query, `${item.people}人が探しています`
      + (item.own_exact === null ? '' : `／自社に一致 ${item.own_exact}・近い ${item.own_near}`),
    demandOfferButton(item.demand_key))));
  // ②値下がり待ち: どこまで下げれば届くか（§24）
  host.append(demandLaneCard('値下がり待ち', '商品は決まっていて、価格だけを待っている人です。中央値まで下げると、待っている人の半数に届きます。', data.price_watch,
    (item) => demandLaneItem(item.product_name, `${item.people}人が待機／中央値 ${jpy(item.median_target_jpy)}`,
      demandLinkButton('価格を見直す', '#catalog'))));
  // ③いつものホシル: 補充のタイミングが読める需要（§23 需要予報）
  host.append(demandLaneCard('いつものホシル', 'なくなる前に買う人です。補充の時期が分かるので、在庫と掲載を先に合わせられます。', data.usual,
    (item) => demandLaneItem(item.product_name, `${item.people}人が継続／30日以内に ${item.within_30_days}人・7日以内に ${item.within_7_days}人`,
      demandLinkButton('在庫を確認', '#catalog'))));
}
// 2026-09-21 指示書 §23「需要予報」。いつものホシルの補充周期から 7/14/30 日以内に
// 必要になる人数を出す。数字は /api/seller/shop/demand の usual（匿名集計・5人以上）だけ。
// 集計できていないときは 0 と書かず、表そのものを出さない。
function renderForecast(usual) {
  const rows = document.querySelector('#sellerForecastRows');
  const section = document.querySelector('#forecast');
  const note = document.querySelector('#sellerForecastNote');
  if (!rows || !section) return;
  const items = usual && usual.measurable !== false && Array.isArray(usual.items) ? usual.items : null;
  if (!items || !items.length) { section.hidden = true; return; }
  rows.replaceChildren();
  for (const item of items.slice(0, 20)) {
    const tr = document.createElement('tr');
    for (const value of [
      item.product_name,
      `${item.people}人`,
      `${item.within_7_days}人`,
      `${item.within_14_days}人`,
      `${item.within_30_days}人`
    ]) {
      const td = document.createElement('td');
      td.textContent = String(value ?? '');
      tr.append(td);
    }
    rows.append(tr);
  }
  const minPeople = Number(usual.min_people) || 5;
  const below = usual.below_threshold || { groups: 0 };
  if (note) {
    note.textContent = below.groups
      ? `ほかに ${below.groups}件が集計待ちです（同じ商品を ${minPeople}人以上が継続で買うと表示します）。予報は登録された補充周期からの見込みで、注文を保証するものではありません。`
      : `同じ商品を ${minPeople}人以上が継続で買っている需要だけを表示します。予報は登録された補充周期からの見込みで、注文を保証するものではありません。`;
  }
  section.hidden = false;
}
function renderDemand(data) {
  const rows = document.querySelector('#sellerDemandRows');
  const select = document.querySelector('#sellerDemandOfferForm select[name="demand_key"]');
  renderThreeDemands(data);
  renderForecast(data.usual);
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
  // 需要の枠はどれか1つでもあれば読み込む（画面の構成が変わっても取りこぼさない）。
  const targets = ['#sellerDemandRows', '#sellerThreeDemands', '#sellerForecastRows'];
  if (!targets.some((selector) => document.querySelector(selector))) return;
  try { renderDemand(await shopRequest('/api/seller/shop/demand')); }
  catch (error) {
    const message = error.message === 'BUSINESS_PLAN_REQUIRED'
      ? '探し中需要は Business プランで確認できます。'
      : `需要を読み込めませんでした（${error.message}）`;
    showDemandStatus(message, true);
    // 先頭の「今あなたが応えられる需要」も読み込めていない。0人と誤解させない。
    const host = document.querySelector('#sellerThreeDemands');
    if (host) host.replaceChildren(demandNode('p', 'metric-help', message));
  }
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
    const messages = { PRODUCT_NOT_IN_YOUR_SHOP: 'その ASIN／URL は、あなたのショップの商品データに見つかりません。', ASIN_OR_URL_REQUIRED: 'ASIN か商品URL を入れてください。', DEMAND_NOT_FOUND: '需要が見つかりません。',
      DEMAND_MATCH_BALANCE_REQUIRED: '前払い残高が 50円未満のため登録できません。「前払い残高とお支払い」からチャージすると、需要への商品登録と通知が再開します。',
      DEMAND_MATCH_BUDGET_OFF: 'Demand Match の予算上限が 0円です。予算上限を設定すると登録できます。',
      DEMAND_MATCH_BUDGET_CAP: '今月の予算上限に達しています。予算上限を上げると登録できます。' };
    showDemandStatus(messages[error.message] || `登録できませんでした（${error.message}）`, true);
  }
});
loadDemand();

// 2026-09-19 大隆さん指示「Seller収益化・需要マッチ改修」§3・§4・§14: Demand Match（通知・有効クリック・利用額・予算上限）
function showDemandMatchStatus(message, error = false) {
  const node = document.querySelector('#sellerDemandMatchStatus');
  if (!node) return;
  node.textContent = message; node.classList.toggle('error', error);
}
function renderDemandMatch(dm) {
  const kpi = (name) => document.querySelector(`[data-dm-kpi="${name}"]`);
  if (!kpi('valid')) return;
  const yen = (value) => `¥${Number(value || 0).toLocaleString('ja-JP')}`;
  kpi('notified').textContent = String(dm.notified ?? 0);
  kpi('valid').textContent = String(dm.valid_clicks ?? 0);
  kpi('excluded').textContent = String(dm.excluded_clicks ?? 0);
  kpi('amount').textContent = dm.free_account ? '¥0（無料アカウント）' : dm.charge_enabled ? yen(dm.amount_jpy) : `${yen(dm.amount_jpy)}（課金開始前・請求 ¥0）`;
  kpi('cap').textContent = yen(dm.cap_jpy);
  const eligibility = dm.eligibility || {};
  const stopped = { BALANCE_REQUIRED: '前払い残高が 50円未満のため、Demand Match は停止中です。需要への商品登録と再照合・本人への通知は行われません。「前払い残高とお支払い」からチャージすると再開します。', BUDGET_OFF: '予算上限が 0円のため、Demand Match は停止中です（需要への商品登録と通知は行われません）。', BUDGET_CAP: '今月の予算上限に達したため、Demand Match は停止中です。来月に再開するか、予算上限を上げてください。' };
  if (!eligibility.ok && stopped[eligibility.reason]) showDemandMatchStatus(stopped[eligibility.reason], true);
  else if (eligibility.reason === 'FUNDED') showDemandMatchStatus(`Demand Match は有効です（前払い残高 ¥${Number(eligibility.available_jpy || 0).toLocaleString('ja-JP')}）。`);
  else if (eligibility.reason === 'FREE_ACCOUNT') showDemandMatchStatus('無料アカウントのため、Demand Match Click は 0円です。');
  kpi('cap-note').textContent = dm.cap_reached ? '今月は上限に達しています。追加課金は止まり、掲載・検索流入は止まりません。' : `${dm.month} の利用額 ${yen(dm.amount_jpy)} ／ 上限 ${yen(dm.cap_jpy)}`;
  const form = document.querySelector('#sellerDemandMatchBudgetForm');
  if (form) {
    const presets = (dm.cap_presets_jpy || [0, 1000, 3000, 5000, 10000]).map(String);
    const cap = String(Number(dm.cap_jpy || 0));
    form.elements.cap_preset.value = presets.includes(cap) ? cap : 'custom';
    form.elements.cap_custom.value = presets.includes(cap) ? '' : cap;
  }
}
async function loadDemandMatch() {
  if (!document.querySelector('[data-dm-kpi="valid"]')) return;
  try { renderDemandMatch((await shopRequest('/api/seller/demand-match')).demand_match || {}); }
  catch (error) { showDemandMatchStatus(`Demand Match の集計を読み込めませんでした（${error.message}）`, true); }
}
document.querySelector('#sellerDemandMatchBudgetForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const preset = form.elements.cap_preset.value;
  const cap = preset === 'custom' ? Number(form.elements.cap_custom.value) : Number(preset);
  if (!Number.isFinite(cap) || cap < 0) { showDemandMatchStatus('上限は 0 以上の金額で入れてください。', true); return; }
  showDemandMatchStatus('予算上限を保存しています…');
  try {
    const data = await shopRequest('/api/seller/demand-match/budget', 'PUT', { monthly_cap_jpy: cap });
    renderDemandMatch(data.demand_match || {});
    showDemandMatchStatus(`予算上限を ¥${Number(data.monthly_cap_jpy || 0).toLocaleString('ja-JP')} に保存しました。`);
  } catch (error) { showDemandMatchStatus(`保存できませんでした（${error.message}）`, true); }
});
loadDemandMatch();

// 2026-09-21 指示書 §40「無料3か月終了時」。
// この3か月で実際に何が起きたかを実数だけで出す。数えられなかった項目は 0 と書かず
// 「計測不能」と出す。見込み売上・推定効果は出さない（クリックは売上ではない）。
function renderFreePeriod(data) {
  const host = document.querySelector('#sellerFreePeriod');
  const section = document.querySelector('#free-period');
  const note = document.querySelector('#sellerFreePeriodNote');
  if (!host || !section) return;
  if (!data || data.ok !== true || data.available !== true) { section.hidden = true; return; }
  host.replaceChildren();
  for (const metric of Array.isArray(data.metrics) ? data.metrics : []) {
    const card = demandNode('article', 'demand-lane');
    card.append(demandNode('span', 'demand-lane-title', metric.label || ''));
    const value = demandNode('p', 'demand-lane-value');
    value.textContent = metric.measurable === true ? Number(metric.value).toLocaleString('ja-JP') : '計測不能';
    card.append(value);
    card.append(demandNode('p', 'demand-lane-note', metric.measurable === true
      ? (metric.note || '')
      : 'この項目はまだ数えられていません。0件という意味ではありません。'));
    host.append(card);
  }
  const period = data.window || {};
  const day = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeZone: 'Asia/Tokyo' }).format(date) : '';
  };
  if (note) {
    const range = day(period.start_at) && day(period.end_at) ? `${day(period.start_at)}〜${day(period.end_at)}` : '';
    const price = Number(data.monthly_price_jpy) > 0 ? `無料期間のあとは月額 ${Number(data.monthly_price_jpy).toLocaleString('ja-JP')}円（税込）です。` : '';
    note.textContent = `${range ? `対象期間: ${range}。` : ''}${price}売上・注文・掲載順位は保証しません。`;
  }
  section.hidden = false;
}
(async () => {
  if (!document.querySelector('#sellerFreePeriod')) return;
  try { renderFreePeriod(await shopRequest('/api/seller/free-period-report')); }
  catch { document.querySelector('#free-period')?.setAttribute('hidden', ''); }
})();
