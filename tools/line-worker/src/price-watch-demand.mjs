// 2026-09-05 夜 大隆さん決定: 「値下がり待ちリスト」を公開する。
// 会員が「この価格になったら教えて☑」で設定した希望価格を、同じ商品名ごとに
// 匿名集計し、5人以上集まった商品だけをトップに出す（大隆さん「5こ以上集まったら表示」）。
// 5人はセラー画面(seller-page.mjs)と同じ k-匿名の閾値で、カードの注意書き
// 「希望額は5人以上で匿名集計」とも一致する。個人の希望額・会員IDは出さない。
// 商品名は会員が設定した target_product_name（モールの商品名）そのもの。
// HOSHILU 側で価格・順位を作らない: 出すのは人数と希望額の平均・最低だけ。

export const PUBLIC_DEMAND_MIN_MEMBERS = 5;
export const PUBLIC_DEMAND_LIMIT = 10;

function shortName(name) {
  // モールの商品名は長いので、表示用に60文字で切る（全文は title 属性で渡す）。
  const text = String(name || '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

export async function publicPriceWatchDemand(env, options = {}) {
  const minMembers = Math.max(PUBLIC_DEMAND_MIN_MEMBERS, Number(options.minMembers) || PUBLIC_DEMAND_MIN_MEMBERS);
  const limit = Math.max(1, Math.min(20, Number(options.limit) || PUBLIC_DEMAND_LIMIT));
  if (!env?.PRODUCT_DB) return { items: [], min_members: minMembers };
  const result = await env.PRODUCT_DB.prepare(`SELECT
      json_extract(condition_snapshot,'$.price_condition.target_product_name') AS product_name,
      count(DISTINCT member_id) AS waiting_members,
      min(CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)) AS min_target_price_jpy,
      round(avg(CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER))) AS average_target_price_jpy,
      max(updated_at) AS last_updated_at
    FROM member_wishes
    WHERE watch_price=1
      AND CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)>=100
      AND length(trim(coalesce(json_extract(condition_snapshot,'$.price_condition.target_product_name'),'')))>0
    GROUP BY json_extract(condition_snapshot,'$.price_condition.target_product_name')
    HAVING count(DISTINCT member_id)>=?1
    ORDER BY waiting_members DESC, last_updated_at DESC
    LIMIT ?2`).bind(minMembers, limit).all();
  const items = (result?.results || []).map((row, index) => ({
    rank: index + 1,
    product_name: shortName(row.product_name),
    full_name: String(row.product_name || '').trim().slice(0, 200),
    waiting_members: Number(row.waiting_members) || 0,
    min_target_price_jpy: Number(row.min_target_price_jpy) || 0,
    average_target_price_jpy: Number(row.average_target_price_jpy) || 0,
    last_updated_at: String(row.last_updated_at || ''),
    // 商品ページではなく HOSHILU の検索へ。読者は同じ商品を検索して自分の
    // 「この価格になったら教えて☑」を押せる（=待っている人が1人増える）。
    search_url: `/?q=${encodeURIComponent(String(row.product_name || '').trim().slice(0, 120))}`
  }));
  return { items, min_members: minMembers };
}

export async function handlePriceWatchDemandRoute(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/price-watch/demand') return null;
  try {
    const result = await publicPriceWatchDemand(env);
    return Response.json({ ok: true, result }, {
      headers: { 'cache-control': 'public, max-age=600', 'x-content-type-options': 'nosniff' }
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || 'DEMAND_FAILED').slice(0, 80) }, {
      status: 502, headers: { 'cache-control': 'no-store' }
    });
  }
}
