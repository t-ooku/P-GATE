// v4.3 指示書 Priority 5 (section 27-30): ショップ・Seller送客計測基盤。
//
// 既存の /go リダイレクト(src/index.mjsのhandleRedirect)は、署名付き
// トラッキングトークン(createTrackToken)の中に既に u(セッションのハッシュ)
// ・r(クエリID、検索文そのものではない)・m(遷移先モール)を持っている。
// このモジュールはそれをsection 28の送客イベント形式(event_type/timestamp/
// hoshilu_product_id/source_marketplace/destination_marketplace/seller_id/
// organic_or_sponsored/search_intent_id/session_id)へ変換するだけで、
// 新しい個人情報を一切追加しない - 検索文そのものは、この経路のどこにも
// 現れない(section 29のプライバシー方針を維持)。
//
// 商品カードの購入先リンクは、検証済みSeller ID・canonical product ID・
// 優先出品判定を署名トークンへ含める。既存リンクや一般検索リンクなど、
// 取得できない経路は引き続きnull/ORGANICとし、推測で補完しない。

const ORGANIC_OR_SPONSORED = new Set(['ORGANIC', 'SPONSORED']);

// トークンpayload(createTrackTokenへ渡した/verifyTrackTokenが返したオブジェ
// クト)から送客イベントを組み立てる純粋関数。
export function buildOutboundCommerceEvent(payload = {}, occurredAt) {
  if (!payload.m && !payload.d) throw new Error('OUTBOUND_EVENT_DESTINATION_MARKETPLACE_REQUIRED');
  const sponsored = payload.sp === true ? 'SPONSORED' : 'ORGANIC';
  return {
    event_id: `${payload.j || `${payload.u || ''}:${payload.a || ''}`}:OUTBOUND_COMMERCE`,
    event_type: 'OUTBOUND_COMMERCE_CLICK',
    occurred_at: String(occurredAt || new Date().toISOString()),
    hoshilu_product_id: payload.hpid ? String(payload.hpid) : null,
    source_marketplace: String(payload.so || 'HOSHILU'),
    destination_marketplace: String(payload.m || ''),
    seller_id: payload.sid ? String(payload.sid) : null,
    organic_or_sponsored: ORGANIC_OR_SPONSORED.has(sponsored) ? sponsored : 'ORGANIC',
    // search_intent_id: 検索文そのものではなく、既存の匿名クエリID(r)を
    // そのまま再利用する(section 29: 匿名化されたSearch Intent IDで紐付け)。
    search_intent_id: payload.r ? String(payload.r) : null,
    session_id: String(payload.u || '')
  };
}

// D1(outbound_commerce_events, migrations/0043)への冪等でないシンプルな
// INSERT。呼び出し元(handleRedirect)はctx.waitUntilで呼ぶ想定なので、
// ここで例外を外へ投げない(既存のrecordMeasurementEventsToD1と同じ
// フォールバック方針: D1未設定・一時障害はログに残して黙って諦める。
// 送客リダイレクト自体はこの計測が失敗しても絶対に止めない)。
export async function recordOutboundCommerceEvent(env, payload, occurredAt) {
  if (!env.PRODUCT_DB) return;
  try {
    const event = buildOutboundCommerceEvent(payload, occurredAt);
    await env.PRODUCT_DB.prepare(
      `INSERT INTO outbound_commerce_events
        (event_id, event_type, occurred_at, hoshilu_product_id, source_marketplace,
         destination_marketplace, seller_id, organic_or_sponsored, search_intent_id, session_id)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(event_id) DO NOTHING`
    ).bind(
      event.event_id, event.event_type, event.occurred_at, event.hoshilu_product_id,
      event.source_marketplace, event.destination_marketplace, event.seller_id,
      event.organic_or_sponsored, event.search_intent_id, event.session_id
    ).run();
  } catch (error) {
    console.warn('OUTBOUND_COMMERCE_EVENT_D1_FALLBACK', { error: String(error.message || error) });
  }
}
