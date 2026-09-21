// 2026-09-21 指示書 §2〜§11「いつものホシル」の画面。
// 「なくなる前に、ホシっとく。」
// ・商品カードに「いつものにする」を出し、押したら補充周期を選ばせる（§3 §4）
// ・ホシル中に一覧と「今週の補充」を出す（§2 §11）
// ・「買った！」で次回を更新する（§5 §6）
// ・状態は4段階だけ。残量は入力させない（§7）
// サーバーが返した事実だけを描く。日数や価格をここで作らない。
const COPY = {
  title: 'いつものホシル',
  lead: 'なくなる前に、ホシっとく。',
  empty: 'まだありません。商品の「いつものにする」を押すと、ここに並びます。',
  login: '無料会員でログインすると、いつものホシルを使えます。',
  thisWeek: '今週の補充',
  makeUsual: 'いつものにする',
  bought: '買った！',
  stop: 'やめる',
  cycleTitle: 'どれくらいでなくなる？',
  cycleNote: 'あとから変えられます。「買った！」を押すうちに、HOSHILUが実際の間隔に合わせます。',
  custom: '自分で設定',
  customUnit: '日',
  save: 'これでホシっとく',
  days: (value) => `あと${value}日くらい`,
  overdue: '予定を過ぎています',
  usualPrice: (value) => `いつもの価格 約${value.toLocaleString('ja-JP')}円`,
  cycleLearned: (days) => `平均補充周期 約${days}日`,
  cycleChosen: (days) => `補充周期 ${days}日`
};
const PRESETS = [7, 14, 30, 60];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const section = () => document.querySelector('#usualHoshiru');
const list = () => document.querySelector('#usualList');

let items = [];
let limit = 0;
let usage = 0;

async function api(path, options) {
  const response = await fetch(`/api/member/usual${path}`, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function card(item) {
  const row = el('div', 'usual-row');
  const media = el('div', 'usual-row-media');
  if (item.image_url) {
    const img = document.createElement('img');
    img.src = item.image_url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    media.append(img);
  } else {
    media.append(el('span', 'usual-row-media-fallback', String(item.product_name || '').slice(0, 2)));
  }
  const body = el('div', 'usual-row-body');
  body.append(el('span', 'usual-row-name', item.product_name || ''));

  // 状態はサーバーが決めた4段階をそのまま出す。ここで作らない。
  const status = el('span', `usual-row-state usual-state-${String(item.state || '').toLowerCase()}`);
  const label = item.state_label || '';
  const daysLeft = Number(item.days_left);
  const daysText = Number.isFinite(daysLeft) ? (daysLeft < 0 ? COPY.overdue : COPY.days(daysLeft)) : '';
  status.textContent = label && daysText ? `${label}｜${daysText}` : label || daysText;
  if (status.textContent) body.append(status);

  const meta = [];
  if (Number(item.cycle_days) > 0) {
    meta.push(item.cycle_source === 'LEARNED' ? COPY.cycleLearned(item.cycle_days) : COPY.cycleChosen(item.cycle_days));
  }
  if (Number(item.usual_price_jpy) > 0) meta.push(COPY.usualPrice(Number(item.usual_price_jpy)));
  if (meta.length) body.append(el('span', 'usual-row-meta', meta.join('・')));

  const actions = el('div', 'usual-row-actions');
  const bought = el('button', 'usual-row-bought', COPY.bought);
  bought.type = 'button';
  bought.addEventListener('click', async () => {
    bought.disabled = true;
    const result = await api(`/${item.usual_id}/purchased`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    bought.disabled = false;
    if (result.ok) await load();
  });
  const stop = el('button', 'usual-row-stop', COPY.stop);
  stop.type = 'button';
  stop.addEventListener('click', async () => {
    if (!confirm(`「${item.product_name}」をいつものホシルからやめますか？`)) return;
    stop.disabled = true;
    const result = await api(`/${item.usual_id}`, { method: 'DELETE' });
    if (result.ok) await load(); else stop.disabled = false;
  });
  actions.append(bought, stop);
  body.append(actions);
  row.append(media, body);
  return row;
}

function render() {
  const root = section();
  const target = list();
  if (!root || !target) return;
  const count = root.querySelector('#usualCount');
  if (count) count.textContent = limit > 0 ? `${usage} / ${limit}` : '';
  if (!items.length) {
    target.replaceChildren(el('p', 'empty', COPY.empty));
    root.querySelector('#usualThisWeek')?.replaceChildren();
    return;
  }
  target.replaceChildren(...items.map(card));

  // §11「今週の補充」: 7日以内のものを近い順に。サーバーが選んだ this_week をそのまま使う。
  const weekBox = root.querySelector('#usualThisWeek');
  if (!weekBox) return;
  const week = items.filter((item) => root.dataset.thisWeek?.split(',').includes(item.usual_id));
  if (!week.length) { weekBox.replaceChildren(); return; }
  const wrap = el('div', 'usual-week');
  wrap.append(el('h4', 'usual-week-title', COPY.thisWeek));
  const ul = el('ul', 'usual-week-list');
  for (const item of week) {
    const li = el('li');
    li.append(el('span', 'usual-week-name', item.product_name || ''));
    const days = Number(item.days_left);
    li.append(el('span', 'usual-week-days', Number.isFinite(days) ? (days < 0 ? COPY.overdue : COPY.days(days)) : ''));
    ul.append(li);
  }
  wrap.append(ul);
  weekBox.replaceChildren(wrap);
}

export async function load() {
  const root = section();
  if (!root) return;
  const result = await api('');
  if (result.status === 401) {
    items = []; limit = 0; usage = 0;
    list()?.replaceChildren(el('p', 'empty', COPY.login));
    return;
  }
  items = Array.isArray(result.body?.items) ? result.body.items : [];
  limit = Number(result.body?.limit) || 0;
  usage = Number(result.body?.usage) || 0;
  root.dataset.thisWeek = (result.body?.this_week || []).join(',');
  render();
}

// §4 登録時の補充周期。難しい在庫入力は求めない。
function cycleDialog(candidate) {
  const dialog = document.createElement('dialog');
  dialog.className = 'usual-cycle-dialog';
  const panel = el('div', 'usual-cycle-panel');
  const close = el('button', 'usual-cycle-close', '✕');
  close.type = 'button'; close.setAttribute('aria-label', '閉じる');
  close.addEventListener('click', () => dialog.close());
  panel.append(close, el('strong', 'usual-cycle-title', COPY.cycleTitle));
  panel.append(el('p', 'usual-cycle-product', String(candidate.product_name || '')));

  let chosen = 30;
  const choices = el('div', 'usual-cycle-choices');
  const buttons = [];
  const select = (days, button) => {
    chosen = days;
    for (const other of buttons) other.classList.toggle('on', other === button);
  };
  for (const days of PRESETS) {
    const button = el('button', 'usual-cycle-choice', `${days}日`);
    button.type = 'button';
    button.addEventListener('click', () => { customField.value = ''; select(days, button); });
    buttons.push(button);
    choices.append(button);
  }
  const customLabel = el('label', 'usual-cycle-custom');
  customLabel.append(el('span', '', COPY.custom));
  const customField = document.createElement('input');
  customField.type = 'number'; customField.min = '3'; customField.max = '365'; customField.step = '1';
  customField.inputMode = 'numeric'; customField.placeholder = '30';
  customField.addEventListener('input', () => {
    const days = Math.round(Number(customField.value));
    if (days >= 3 && days <= 365) select(days, null);
  });
  customLabel.append(customField, el('span', '', COPY.customUnit));
  select(30, buttons[PRESETS.indexOf(30)]);

  const note = el('p', 'usual-cycle-note', COPY.cycleNote);
  const save = el('button', 'usual-cycle-save', COPY.save);
  save.type = 'button';
  const status = el('p', 'usual-cycle-status', '');
  save.addEventListener('click', async () => {
    save.disabled = true;
    const result = await api('', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...candidate, cycle_days: chosen })
    });
    save.disabled = false;
    if (result.ok) { await load(); dialog.close(); return; }
    // 上限や未ログインは、サーバーが返した日本語をそのまま出す（こちらで文言を作らない）。
    status.textContent = result.body?.message
      || (result.status === 401 ? COPY.login : 'いま登録できませんでした。しばらくしてからお試しください。');
  });
  panel.append(choices, customLabel, note, save, status);
  dialog.append(panel);
  return dialog;
}

// 商品カードから「いつものにする」。app.js が各カードで投げるイベントに相乗りする。
function attachMakeUsual(detail) {
  const candidate = detail?.candidate;
  const container = detail?.container;
  if (!candidate || !container) return;
  const name = String(candidate.display_name || candidate.product_name || '').trim();
  if (name.length < 2) return;
  const button = el('button', 'usual-make-button', COPY.makeUsual);
  button.type = 'button';
  const offer = (Array.isArray(candidate.offers) ? candidate.offers : []).find((item) => item?.product_url);
  const payload = {
    product_name: name,
    product_key: String(candidate.target_product_key || candidate.record_key || candidate.asin || ''),
    image_url: String((Array.isArray(candidate.image_urls) ? candidate.image_urls[0] : '') || candidate.image_url || candidate.image || ''),
    product_url: String(offer?.product_url || candidate.product_url || '')
  };
  button.addEventListener('click', () => {
    const dialog = cycleDialog(payload);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    dialog.showModal();
  });
  container.append(button);
}

document.addEventListener('hoshilu:product-card-actions', (event) => attachMakeUsual(event.detail));
document.addEventListener('hoshilu:member-session-changed', () => { load(); });
load();
