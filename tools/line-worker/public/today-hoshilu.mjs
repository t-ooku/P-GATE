// 2026-09-21 指示書 §37「今日のHOSHILU」・§38「通知を乱発しない」の画面側。
//
// 押し出す通知を増やすかわりに、開いたときにここを見れば今日の用事が分かるようにする。
// サーバーが返した事実だけを描く。日数・価格・件数をここで作らない。
// 何も無い日は、何も無いとだけ言う（無いものを足さない）。
const COPY = {
  title: '今日のホシル',
  lead: '今日ぶんだけ、ここにまとめます。',
  empty: '今日は特にありません。',
  loginless: '',
  days: (value) => `あと${value}日`,
  overdue: '予定を過ぎています',
  reached: (target, current) => `希望 ${target.toLocaleString('ja-JP')}円 → 今 ${current.toLocaleString('ja-JP')}円`,
  level: { EXACT: '条件に一致', NEAR: '近い商品' }
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function usualLine(item) {
  const row = el('li', 'today-row');
  row.append(el('strong', null, item.product_name || ''));
  const left = Number(item.days_left);
  const parts = [item.state_label || ''];
  if (Number.isFinite(left)) parts.push(left < 0 ? COPY.overdue : COPY.days(left));
  row.append(el('span', null, parts.filter(Boolean).join('・')));
  return row;
}

function priceLine(item) {
  const row = el('li', 'today-row');
  row.append(el('strong', null, item.product_name || ''));
  const target = Number(item.target_price_jpy);
  const current = Number(item.current_price_jpy);
  if (target > 0 && current > 0) row.append(el('span', null, COPY.reached(target, current)));
  return row;
}

function matchedLine(item) {
  const row = el('li', 'today-row');
  row.append(el('strong', null, item.query || ''));
  const label = COPY.level[item.level];
  if (label) row.append(el('span', null, label));
  return row;
}

const LINE_FOR = { USUAL: usualLine, PRICE: priceLine, MATCHED: matchedLine };

function render(body) {
  const root = document.querySelector('#todayHoshilu');
  if (!root) return;
  const target = root.querySelector('#todayList');
  if (!target) return;
  if (!body || body.ok !== true) { root.hidden = true; return; }
  const sections = Array.isArray(body.sections) ? body.sections : [];
  if (!sections.length) {
    target.replaceChildren(el('p', 'empty', COPY.empty));
    root.hidden = false;
    return;
  }
  const nodes = [];
  for (const section of sections) {
    const line = LINE_FOR[section.kind];
    if (!line || !Array.isArray(section.items) || !section.items.length) continue;
    const block = el('div', 'today-section');
    block.append(el('span', 'today-section-title', section.title || ''));
    const list = el('ul', 'today-rows');
    for (const item of section.items) list.append(line(item));
    block.append(list);
    nodes.push(block);
  }
  target.replaceChildren(...nodes);
  root.hidden = false;
}

async function load() {
  const root = document.querySelector('#todayHoshilu');
  if (!root) return;
  try {
    const response = await fetch('/api/member/today', { cache: 'no-store' });
    // 未ログインなら黙って畳む（ログインを促す文言は他の場所が持っている）。
    if (response.status === 401) { root.hidden = true; return; }
    render(await response.json());
  } catch { root.hidden = true; }
}

load();
document.addEventListener('hoshilu:member-signed-in', load);
