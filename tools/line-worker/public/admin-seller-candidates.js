// 2026-09-21 指示書 §35・§36「Seller営業を需要起点に」「Seller候補管理」。
//
// 未充足の需要 → 候補 → 営業済 → 返信 → 無料登録 → 商品連携 → DMC発生 → 有料化。
//
// 守ること:
//   ・数字はサーバーの実データだけ。件数をここで作らない
//   ・数えられないときは 0 件と書かず、そう書く
//   ・候補は消さない。降りた相手は「見送り」にして履歴を残す
//   ・入れるのは公開されている事業者向けの情報だけ（画面の項目もそれだけ）

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const status = (message, error = false) => {
  const node = document.querySelector('#candidateStatus');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', error);
};

async function api(path, options) {
  const response = await fetch(`/api/admin/seller-candidates${path}`, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok && body.ok === true, status: response.status, body };
}

const STAGES = ['FOUND', 'CONTACTED', 'REPLIED', 'SIGNED_UP', 'PRODUCTS_LINKED', 'DMC_EARNED', 'PAID', 'DECLINED'];

function table(headers, rows) {
  const wrap = el('table');
  const head = el('thead');
  const headRow = el('tr');
  for (const label of headers) headRow.append(el('th', null, label));
  head.append(headRow);
  const body = el('tbody');
  for (const cells of rows) {
    const tr = el('tr');
    for (const cell of cells) {
      const td = el('td');
      if (cell instanceof Node) td.append(cell);
      else td.textContent = String(cell ?? '');
      tr.append(td);
    }
    body.append(tr);
  }
  wrap.append(head, body);
  return wrap;
}

function link(url, label) {
  if (!url) return '';
  const node = el('a', null, label);
  node.href = url;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}

// 段階を進める。サーバーが日付を初回だけ入れる（過去は上書きしない）。
function stageSelect(item, labels, reload) {
  const select = el('select');
  for (const stage of STAGES) {
    const option = el('option', null, labels[stage] || stage);
    option.value = stage;
    if (stage === item.stage) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', async () => {
    select.disabled = true;
    status('段階を更新しています…');
    const result = await api(`/${item.candidate_id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: select.value })
    });
    select.disabled = false;
    if (result.ok) { status('更新しました。'); await reload(); }
    else status(`更新できませんでした（${result.body?.error || result.status}）`, true);
  });
  return select;
}

function renderCounts(body) {
  const host = document.querySelector('#candidateCounts');
  if (!host) return;
  host.replaceChildren();
  if (body.measurable !== true) {
    // まだ数えられていないだけ。0 件とは書かない。
    host.append(el('p', 'metric-help', 'いま候補を数えられていません。0件という意味ではありません。'));
    return;
  }
  const labels = body.labels || {};
  for (const stage of STAGES) {
    const card = el('article', 'seller-panel');
    card.append(el('span', null, labels[stage] || stage));
    card.append(el('strong', null, String(body.counts?.[stage] ?? 0)));
    host.append(card);
  }
  const total = el('article', 'seller-panel');
  total.append(el('span', null, '追跡中（見送りを除く）'));
  total.append(el('strong', null, String(body.live ?? 0)));
  host.append(total);
}

function renderRows(body, reload) {
  const host = document.querySelector('#candidateRows');
  if (!host) return;
  host.replaceChildren();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    host.append(el('p', 'metric-help', body.measurable === true
      ? 'まだ候補がありません。上の「候補を足す」から入れてください。'
      : 'いま候補を読み込めていません。'));
    return;
  }
  const labels = body.labels || {};
  host.append(table(
    ['ショップ', '需要', '人数', '段階', '連絡先', '商品', 'メモ', '更新'],
    items.map((item) => [
      item.shop_name,
      item.demand_label || '—',
      Number(item.demand_people) > 0 ? `${item.demand_people}人` : '—',
      stageSelect(item, labels, reload),
      link(item.contact_url, '問い合わせ') || link(item.source_url, '出典') || '—',
      link(item.product_url, '商品') || '—',
      item.note || '',
      String(item.updated_at || '').slice(0, 10)
    ])
  ));
}

// いま応え手がいない需要。公開集計（5人以上）だけを読む。
async function renderDemands() {
  const host = document.querySelector('#candidateDemands');
  if (!host) return;
  host.replaceChildren();
  try {
    const response = await fetch('/api/shops/demand/public', { cache: 'no-store' });
    const body = await response.json();
    const items = Array.isArray(body?.items) ? body.items.slice(0, 12) : [];
    if (!items.length) {
      host.append(el('p', 'metric-help',
        `同じ条件を ${Number(body?.min_people || 5)}人以上が探している需要が集まると、ここに出ます。需要が0件という意味ではありません。`));
      return;
    }
    host.append(table(['探されているもの', '人数', ''], items.map((item) => {
      const use = el('button', 'ghost-button', 'この需要の候補を足す');
      use.type = 'button';
      use.addEventListener('click', () => {
        const form = document.querySelector('#candidateForm');
        if (!form) return;
        form.elements.demand_label.value = item.conditions || '';
        form.elements.demand_people.value = String(Number(item.people) || 0);
        form.elements.shop_name.focus();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return [item.conditions, `${Number(item.people) || 0}人`, use];
    })));
  } catch {
    host.append(el('p', 'metric-help', 'いま需要を読み込めませんでした。'));
  }
}

async function load() {
  status('読み込んでいます…');
  const result = await api('');
  if (result.status === 401) { location.replace('/admin-login'); return; }
  if (!result.ok) { status(`読み込めませんでした（${result.body?.error || result.status}）`, true); return; }
  renderCounts(result.body);
  renderRows(result.body, load);
  status('');
}

document.querySelector('#candidateForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(
    ['shop_name', 'demand_label', 'demand_key', 'contact_url', 'source_url', 'product_url', 'note']
      .map((name) => [name, form.elements[name].value])
  );
  payload.demand_people = Number(form.elements.demand_people.value) || 0;
  const out = document.querySelector('#candidateResult');
  if (out) out.textContent = '追加しています…';
  const result = await api('', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (out) {
    out.textContent = result.ok
      ? (result.body.added ? '候補に足しました。' : 'この需要には、同じショップが既に入っています。')
      : `追加できませんでした（${result.body?.error || result.status}）`;
  }
  if (result.ok && result.body.added) { form.reset(); await load(); }
});

document.querySelector('#refreshCandidates')?.addEventListener('click', () => { load(); renderDemands(); });
document.querySelector('#adminLogout')?.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.replace('/admin-login');
});

load();
renderDemands();

// Operator recovery view. Never equate API_ACCEPTED with mailbox delivery.
(async()=>{
  const section=el('section','auth-card');section.append(el('h2',null,'掲載見本の相談受付'));
  document.querySelector('main')?.prepend(section);
  try{
    const response=await fetch('/api/admin/seller-business/inquiries',{cache:'no-store'});
    if(!response.ok)throw new Error('相談一覧を取得できません。管理者ログインを確認してください。');
    const data=await response.json();
    section.append(el('p',null,data.notification_tracking==='AVAILABLE'?'通知状態はAPI受付までの記録です。配達・実返信は受信先で確認してください。':'通知状態は未計測です。受付内容は保存されています。0088適用前の履歴を配達済みと扱いません。'));
    for(const row of data.inquiries||[]){
      const detail=el('details');detail.append(el('summary',null,`${row.organization_name} / ${row.inquiry_id} / ${row.status}`));
      for(const value of [row.created_at,row.contact_name,row.contact_email,row.storefront_url,row.message])detail.append(el('p',null,value));
      const state=data.notification_states?.find(s=>s.inquiry_id===row.inquiry_id)?.state||'未確認';detail.append(el('p',null,`担当者通知：${state}`));
      const retry=el('button',null,'担当者通知を再試行');retry.type='button';
      retry.addEventListener('click',async()=>{
        retry.disabled=true;const note=el('p',null,'通知しています…');detail.append(note);
        try{const sent=await fetch(`/api/admin/seller-business/inquiries/${encodeURIComponent(row.inquiry_id)}/notify`,{method:'POST'});note.textContent=sent.ok?'通知APIが受け付けました。受信先で確認してください。':'通知できませんでした。受付内容は保持されています。';}catch{note.textContent='通信に失敗しました。受付内容は保持されています。';}finally{retry.disabled=false;}
      });detail.append(retry);section.append(detail);
    }
    if(!data.inquiries?.length)section.append(el('p',null,'保存された相談はありません。'));
  }catch(error){section.append(el('p',null,error.message));}
})();
