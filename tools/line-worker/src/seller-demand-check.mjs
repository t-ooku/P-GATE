// 2026-09-21 指示書 §31「需要チェック」: /for-sellers の検索窓に商品名・JAN・ASIN・型番・
// ブランドを入れると、その商品を待っている人数を返す。
//
//   探し中 7人 / 値下がり待ち 18人 / いつものホシル 31人 / 30日以内補充予定 12人
//
// 絶対に守ること:
// - **架空件数は禁止**（§30）。返すのは実データだけ。作らない。
// - 匿名集計の規則を継承する。最低 5 人・内部会員除外・個人情報は返さない。
// - 5 人未満の需要は人数を出さない。「まだ集計できる人数に達していません」と伝える。
// - 数えられないときは 0 と断定せず measurable:false（計測不能と 0 を区別する）。
// - 入力された検索語を D1 に記録しない（検索本文を残さない境界を継続）。
import { searchingDemandOverview } from './searching-demand.mjs';
import { usualDemandForecast, targetPriceDemand } from './usual-demand.mjs';

const MAX_QUERY = 120;

export function normalizeDemandQuery(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_QUERY);
}

// 語ごとに見て、全部含まれていれば一致とする（「黒 トート」で「黒の本革トート」に当たる）。
export function matchesDemandQuery(text, query) {
  const haystack = String(text || '').normalize('NFKC').toLowerCase();
  if (!haystack) return false;
  const words = String(query || '').toLowerCase().split(' ').filter(Boolean);
  return words.length > 0 && words.every((word) => haystack.includes(word));
}

const sumPeople = (items, pick) => items.reduce((total, item) => total + (Number(pick(item)) || 0), 0);

// 3 種類の需要から、検索語に当たるものだけを足す。
// 各 items は集計側で既に「5人以上」だけに絞られているので、ここで再度しきい値を見る必要はない。
export function buildDemandCheck({ query, searching, priceWatch, usual, minPeople }) {
  const searchingItems = (searching?.items || []).filter((item) => matchesDemandQuery(item.query, query));
  const priceItems = (priceWatch?.items || []).filter((item) => matchesDemandQuery(item.product_name, query));
  const usualItems = (usual?.items || []).filter((item) => matchesDemandQuery(item.product_name, query));

  const searchingPeople = sumPeople(searchingItems, (item) => item.people);
  const pricePeople = sumPeople(priceItems, (item) => item.people);
  const usualPeople = sumPeople(usualItems, (item) => item.people);
  const usualWithin30 = sumPeople(usualItems, (item) => item.within_30_days);

  // 「どこまで下げれば届くか」は、当たった商品のうち人数が最多のものを代表に出す。
  const leadPrice = [...priceItems].sort((a, b) => b.people - a.people)[0] || null;

  return {
    query,
    min_people: minPeople,
    // 3 系統とも数えられて初めて measurable。1 つでも落ちていれば「計測不能」を明示する。
    measurable: Boolean(searching) && priceWatch?.measurable === true && usual?.measurable === true,
    searching: { people: searchingPeople, groups: searchingItems.length },
    price_watch: {
      people: pricePeople,
      groups: priceItems.length,
      median_target_jpy: leadPrice?.median_target_jpy ?? null,
      steps: leadPrice?.steps || []
    },
    usual: {
      people: usualPeople,
      groups: usualItems.length,
      within_30_days: usualWithin30,
      within_14_days: sumPeople(usualItems, (item) => item.within_14_days),
      within_7_days: sumPeople(usualItems, (item) => item.within_7_days)
    },
    total_people: searchingPeople + pricePeople + usualPeople,
    // 5 人以上の需要が 1 つも当たらなかった＝人数を出せる需要がない、という状態。
    // 「0 人」ではなく「まだ出せる人数に達していない」と伝えるために分けて返す。
    below_threshold: searchingItems.length === 0 && priceItems.length === 0 && usualItems.length === 0
  };
}

export async function handleSellerDemandCheckRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/seller/demand-check') return null;
  if (request.method !== 'GET') {
    return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { 'cache-control': 'no-store' } });
  }
  const query = normalizeDemandQuery(url.searchParams.get('q'));
  if (query.length < 2) {
    return Response.json({ ok: false, error: 'DEMAND_CHECK_QUERY_TOO_SHORT' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }
  const [searching, priceWatch, usual] = await Promise.all([
    searchingDemandOverview(env).catch(() => null),
    targetPriceDemand(env).catch(() => null),
    usualDemandForecast(env).catch(() => null)
  ]);
  const result = buildDemandCheck({
    query, searching, priceWatch, usual,
    minPeople: usual?.min_people || priceWatch?.min_people || searching?.min_people || 5
  });
  // 検索語は返答に載せるだけで、D1 には書かない。
  return Response.json({ ok: true, ...result }, {
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
  });
}
