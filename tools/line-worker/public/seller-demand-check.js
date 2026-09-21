// 2026-09-21 指示書 §31「需要チェック」: /for-sellers の検索窓。
// 商品名・JAN・ASIN・型番・ブランドを入れると、その商品を待っている人数を返す。
// 人数はサーバーの匿名集計（5人以上・内部会員除外）をそのまま出す。
// **架空件数は出さない**（§30）。当たらなければ「まだ出せる需要がありません」と言う。
(function () {
  var form = document.querySelector('#demandCheckForm');
  var field = document.querySelector('#demandCheckQuery');
  var out = document.querySelector('#demandCheckResult');
  if (!form || !field || !out) return;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function stat(label, people) {
    var box = el('div', 'demand-check-stat');
    box.append(el('strong', 'demand-check-number', String(people) + '人'));
    box.append(el('span', 'demand-check-label', label));
    return box;
  }

  function render(body) {
    out.replaceChildren();
    if (!body || body.ok !== true) {
      out.append(el('p', 'demand-check-note', 'いま需要を確認できませんでした。しばらくしてからお試しください。'));
      return;
    }
    if (body.measurable !== true) {
      // 0 人と断定しない。計測できていないことを正直に言う。
      out.append(el('p', 'demand-check-note', 'いまこの需要は集計できていません。数字が出せるようになったら表示します。'));
      return;
    }
    if (body.below_threshold === true) {
      out.append(el('p', 'demand-check-note',
        '「' + body.query + '」を待っている人は、まだ公開できる人数（' + body.min_people + '人以上）に達していません。'));
      out.append(el('p', 'demand-check-note',
        '個人が特定されないよう、' + body.min_people + '人以上集まった需要だけを公開しています。'));
      return;
    }
    out.append(el('p', 'demand-check-query', '「' + body.query + '」を待っている人'));
    var grid = el('div', 'demand-check-grid');
    grid.append(stat('探し中', body.searching.people));
    grid.append(stat('値下がり待ち', body.price_watch.people));
    grid.append(stat('いつものホシル', body.usual.people));
    grid.append(stat('30日以内に補充予定', body.usual.within_30_days));
    out.append(grid);
    if (body.price_watch.median_target_jpy) {
      out.append(el('p', 'demand-check-note',
        '値下がり待ちの希望価格は中央値 ¥' + Number(body.price_watch.median_target_jpy).toLocaleString('ja-JP')
        + '。ここまで下げると、待っている人の半数に届きます。'));
    }
    var actions = el('div', 'demand-check-actions');
    var apply = el('a', 'primary', 'この需要に商品を届ける');
    apply.href = '#businessForm';
    apply.setAttribute('data-seller-cta', 'demand-check-apply');
    var free = el('a', 'ghost', '3か月無料で始める');
    free.href = '#businessForm';
    free.setAttribute('data-seller-cta', 'demand-check-free');
    actions.append(apply, free);
    out.append(actions);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var query = String(field.value || '').trim();
    if (query.length < 2) {
      out.replaceChildren(el('p', 'demand-check-note', '商品名・JAN・ASIN・型番・ブランドのいずれかを2文字以上で入れてください。'));
      return;
    }
    out.replaceChildren(el('p', 'demand-check-note', '確認しています…'));
    fetch('/api/seller/demand-check?q=' + encodeURIComponent(query), { cache: 'no-store' })
      .then(function (response) { return response.json(); })
      .then(render)
      .catch(function () { render(null); });
  });
})();
