// 2026-10-02 指示書「今ほしい人が買うためのサービス」§9 商品詳細。
// 順序: 商品 → 現在価格 → 過去との比較 → 価格推移 → 購入先 → 購入 → 口コミ → 今買わない人へ。
// 事実だけを出す。将来の値動きを言い切る表現（底値・先の値下がり・買うべき）は書かない（§6）。
const root = document.getElementById('productDetail');
const status = document.getElementById('productStatus');
const key = root?.dataset.key || '';

const yen = (value) => `¥${Number(value).toLocaleString('ja-JP')}`;
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const send = (event_type, extra = {}) => {
  try {
    const identity = window.HoshiluGrowthIdentity;
    const body = JSON.stringify({ event_type, visitor_id: identity?.visitorId?.() || '', session_id: identity?.sessionId?.() || '', ...extra });
    if (navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) return;
    fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {}
};

function stockLabel(value) {
  return { IN_STOCK: '在庫あり', OUT_OF_STOCK: '在庫なし' }[value] || '在庫未確認';
}

function fetchedLabel(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 取得`;
}

// 過去との比較は「事実」だけ。差は中央値に対する割合で、言い切らない。
function comparisonLines(history, current) {
  const lines = [];
  if (!history?.measurable) return lines;
  if (history.seven_days_ago) lines.push(`7日前 ${yen(history.seven_days_ago.price)}`);
  if (history.d30) lines.push(`30日 最安 ${yen(history.d30.min)} ／ 最高 ${yen(history.d30.max)}（記録 ${history.d30.days_observed}日）`);
  if (history.d90 && history.d90.days_observed > (history.d30?.days_observed || 0)) {
    lines.push(`90日 最安 ${yen(history.d90.min)} ／ 中央値 ${yen(history.d90.median)} ／ 最高 ${yen(history.d90.max)}`);
  }
  // 30日より古い記録が無いうちは「90日」と言わない（記録期間より長い期間名を出さない）。
  const d90Longer = history.d90 && history.d90.days_observed > (history.d30?.days_observed || 0);
  const base = d90Longer && history.d90.days_observed >= 14 ? history.d90 : history.d30?.days_observed >= 7 ? history.d30 : null;
  if (current && base) {
    const diff = Math.round((current - base.median) / base.median * 100);
    if (diff <= -3) lines.push(`現在価格は${base === history.d90 ? '90' : '30'}日中央値より約${Math.abs(diff)}％安い`);
    else if (diff >= 3) lines.push(`現在価格は${base === history.d90 ? '90' : '30'}日中央値より約${diff}％高い`);
    else lines.push(`現在価格は${base === history.d90 ? '90' : '30'}日中央値とほぼ同じ`);
    if (current <= base.min) lines.push('HOSHILU価格記録開始後の最安値');
  }
  return lines;
}

// 価格推移: 単一系列の折れ線（inline SVG）。記録が無い日は線を引かない（点を結ばない）。
function chart(series) {
  const points = series.filter((p) => Number(p.price) > 0);
  if (!points.length) return null;
  const W = 320; const H = 120; const padX = 8; const padY = 14;
  // 2026-10-09 大隆さん報告「グラフが表示されてないよ」: 記録が1日分だと線が引けず、グラフごと出していなかった。
  // 1日分でも枠を出し、今日の点を1つ打つ（線は2日目から。取っていない日を埋めない）。
  if (points.length === 1) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'product-chart product-chart-single');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `価格推移 ${points[0].date} の記録1日分。${yen(points[0].price)}。`);
    const guide = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    guide.setAttribute('x1', padX); guide.setAttribute('x2', W - padX); guide.setAttribute('y1', H / 2); guide.setAttribute('y2', H / 2);
    guide.setAttribute('class', 'product-chart-guide');
    svg.append(guide);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', W - padX - 6); dot.setAttribute('cy', H / 2); dot.setAttribute('r', '4');
    dot.setAttribute('class', 'product-chart-dot');
    svg.append(dot);
    const text = (value, px, py, anchor) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', px); t.setAttribute('y', py); t.setAttribute('text-anchor', anchor); t.setAttribute('class', 'product-chart-label');
      t.textContent = value; svg.append(t);
    };
    text(yen(points[0].price), W - padX, H / 2 - 12, 'end');
    text(String(points[0].date).slice(5).replace('-', '/').replace(/^0/u, ''), W - padX, H / 2 + 20, 'end');
    return svg;
  }
  const dates = points.map((p) => Date.parse(p.date));
  const prices = points.map((p) => p.price);
  const minD = Math.min(...dates); const maxD = Math.max(...dates) || minD + 1;
  const minP = Math.min(...prices); const maxP = Math.max(...prices);
  const x = (d) => padX + (maxD === minD ? 0 : (d - minD) / (maxD - minD)) * (W - padX * 2);
  const y = (p) => H - padY - (maxP === minP ? 0.5 : (p - minP) / (maxP - minP)) * (H - padY * 2);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'product-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `価格推移 ${points[0].date} から ${points[points.length - 1].date}。最安 ${yen(minP)}、最高 ${yen(maxP)}。`);
  // 連続した日だけ線で結ぶ。空白の日は切る（取っていない期間を埋めない）。
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const gap = i > 0 && (dates[i] - dates[i - 1]) > 36 * 60 * 60 * 1000;
    d += `${i === 0 || gap ? 'M' : 'L'}${x(dates[i]).toFixed(1)},${y(prices[i]).toFixed(1)} `;
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d.trim());
  path.setAttribute('class', 'product-chart-line');
  svg.append(path);
  for (let i = 0; i < points.length; i += 1) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x(dates[i]).toFixed(1)); c.setAttribute('cy', y(prices[i]).toFixed(1)); c.setAttribute('r', '2.2');
    c.setAttribute('class', 'product-chart-dot');
    svg.append(c);
  }
  const label = (text, px, py, anchor) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', px); t.setAttribute('y', py); t.setAttribute('text-anchor', anchor); t.setAttribute('class', 'product-chart-label');
    t.textContent = text; svg.append(t);
  };
  label(yen(maxP), padX, 10, 'start');
  label(yen(minP), W - padX, H - 2, 'end');
  return svg;
}

function render(data) {
  root.replaceChildren();
  const product = data.product;
  const offers = data.current?.offers || [];
  // 「今いくら？」は送料込みの合計が確認できた販売先の最安。送料未確認の価格とは比べない（混ぜない）。
  const confirmed = offers.filter((o) => o.total !== null);
  const pool = confirmed.length ? confirmed : offers;
  const cheapest = pool.length ? pool.reduce((a, b) => ((a.total ?? a.price) <= (b.total ?? b.price) ? a : b)) : null;
  const currentPrice = cheapest ? (cheapest.total ?? cheapest.price) : null;

  // 1 商品
  const head = el('section', 'product-head');
  if (product?.image_url) {
    const img = document.createElement('img'); img.src = product.image_url; img.alt = ''; img.loading = 'eager'; img.referrerPolicy = 'no-referrer';
    head.append(img);
  }
  const nameWrap = el('div', 'product-head-text');
  nameWrap.append(el('h1', 'product-name', product?.name || '価格を確認できませんでした'));
  if (product?.marketplace_label) nameWrap.append(el('p', 'product-mall', `${product.marketplace_label} で確認した商品`));
  head.append(nameWrap);
  root.append(head);

  // 2 現在価格
  const now = el('section', 'product-now');
  now.append(el('h2', '', '今いくら？'));
  if (cheapest) {
    now.append(el('p', 'product-now-price', yen(currentPrice)));
    now.append(el('p', 'product-now-note', `${cheapest.total === null ? '送料未確認・商品価格のみ' : '送料込み'} ／ ${cheapest.marketplace_label} ／ ${fetchedLabel(data.current.fetched_at)}`));
  } else {
    now.append(el('p', 'product-now-missing', data.current?.status === 'API_FAILURE' ? '販売先の価格をいま確認できませんでした。少し待って開き直してください。' : 'この商品の現在価格は取得できませんでした（販売終了か、販売先で商品コードが変わった可能性があります）。'));
  }
  root.append(now);

  // 3 過去との比較
  const history = data.history || {};
  const past = el('section', 'product-history');
  past.append(el('h2', '', '過去の価格と比べる'));
  if (history.measurable) {
    const list = el('ul', 'product-history-list');
    for (const line of comparisonLines(history, currentPrice)) list.append(el('li', '', line));
    if (!list.children.length) list.append(el('li', '', `記録 ${history.series.length}日分。比較できるだけの日数がまだありません。`));
    past.append(list);
    past.append(el('p', 'product-history-since', `HOSHILUでの価格記録開始：${history.recording_since.replace(/-/gu, '/')}（記録は1日1回。無い日は空白のままにしています）`));
    // 4 価格推移
    const svg = chart(history.series);
    if (svg) past.append(svg);
    if (history.series.filter((p) => Number(p.price) > 0).length === 1) {
      past.append(el('p', 'product-chart-note', '記録1日目です。明日以降の記録と線でつながります。'));
    }
  } else {
    past.append(el('p', 'product-history-none', 'この商品の価格記録は、今日から始まります。明日以降に過去との比較が出ます。'));
  }
  root.append(past);

  // 5・6 購入先と購入ボタン
  const buy = el('section', 'product-offers');
  buy.append(el('h2', '', '買う場所を選ぶ'));
  if (offers.length) {
    const table = el('table', 'product-offer-table');
    const thead = el('thead'); const tr = el('tr');
    for (const h of ['販売先', '商品価格', '送料', '合計', '在庫', '']) tr.append(el('th', '', h));
    thead.append(tr); table.append(thead);
    const tbody = el('tbody');
    for (const offer of offers) {
      const row = el('tr');
      const cellOf = (label, text) => { const td = el('td', '', text); td.dataset.label = label; return td; };
      row.append(cellOf('販売先', offer.seller_id ? `${offer.marketplace_label}（${offer.seller_id}）` : offer.marketplace_label));
      row.append(cellOf('商品価格', yen(offer.price)));
      row.append(cellOf('送料', offer.shipping_fee_confirmed ? (offer.shipping_fee === 0 ? '無料' : yen(offer.shipping_fee)) : '未確認'));
      row.append(cellOf('合計', offer.total === null ? '—' : yen(offer.total)));
      row.append(cellOf('在庫', stockLabel(offer.stock_status)));
      const cell = el('td');
      if (offer.tracking_url) {
        const a = el('a', 'product-buy', `${offer.marketplace_label}で買う`);
        a.href = offer.tracking_url; a.target = '_blank'; a.rel = 'noopener noreferrer sponsored';
        a.addEventListener('click', () => send('marketplace_click', { marketplace: offer.marketplace, content: 'product_detail' }));
        cell.append(a);
      }
      row.append(cell);
      tbody.append(row);
    }
    table.append(tbody);
    buy.append(table);
    buy.append(el('p', 'product-offer-note', `価格・送料・在庫は ${fetchedLabel(data.current.fetched_at)} 時点の確認値です。購入前に販売先でご確認ください。`));
  } else {
    buy.append(el('p', '', '購入先をいま確認できませんでした。'));
  }
  root.append(buy);

  // 7 口コミ（取得元つき）
  const reviewed = offers.find((o) => o.review_count > 0);
  if (reviewed) {
    const rev = el('section', 'product-reviews');
    rev.append(el('h2', '', '口コミ'));
    const p = el('p', '', `${reviewed.marketplace_label}：${reviewed.review_average.toFixed(1)}（${reviewed.review_count.toLocaleString('ja-JP')}件）`);
    if (reviewed.review_url) { const a = el('a', '', ' 口コミを見る'); a.href = reviewed.review_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.append(a); }
    rev.append(p);
    root.append(rev);
  }

  // 8 今は買わない人へ（既存の希望価格ウォッチへ）
  const later = el('section', 'product-later');
  later.append(el('h2', '', '今は買わない'));
  const link = el('a', 'product-later-link', 'この価格になったら教えて（希望価格を決める）');
  // 商品詳細で「希望価格を決める」と選んだ人を、同じ商品の検索結果まで戻して
  // もう一度価格通知ボタンを探させない。watch=1 は検索完了後に既存の価格入力
  // ダイアログを1回だけ開く意図フラグで、商品名・価格は引き続き検索/API結果を使う。
  link.href = `/?q=${encodeURIComponent(product?.name || '')}&from=product&watch=1`;
  later.append(link);
  later.append(el('p', 'product-later-note', '検索結果の商品カードから希望価格を登録すると、その価格以下になったときにお知らせします。'));
  root.append(later);
}

async function main() {
  if (!root || !key) return;
  // 入口（search / buzz）だけを content に入れて数える（§12）。それ以外は空。
  const from = new URLSearchParams(location.search).get('from');
  send('product_detail_view', { content: ['search', 'buzz'].includes(from) ? from : '' });
  try {
    const res = await fetch(`/api/product?key=${encodeURIComponent(key)}&s=${encodeURIComponent(window.HoshiluGrowthIdentity?.sessionId?.() || '')}`, { cache: 'no-store' });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'PRODUCT_UNAVAILABLE');
    render(data);
  } catch {
    if (status) status.textContent = 'いま価格を確認できませんでした。少し待って開き直してください。';
  }
}
main();
