import { readMemberSession } from './member-auth.mjs';
import { buildConditionSnapshot, serializeConditionSnapshot } from './insight-search-watch.mjs';
import { recordContinuousSearchEnabled, recordTargetPriceWatchSet } from './growth-events.mjs';
const LANGUAGES = new Set(['JA', 'EN', 'ZH', 'KO']);
const WATCH_FREQUENCIES = new Set(['INSTANT', 'DAILY', 'WEEKLY', 'MUTED']);
const clean = (value) => String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
// HOSHILU INSIGHT v1.0 (section 15): member_wishes は AIウォッチ(🔔ボタン,
// watch_sale/watch_price/watch_coupon/watch_restock)と HOSHILU INSIGHT
// (この保存条件リスト, notify_new_match)の両方から書き込まれる同じ行を
// 共有している。どちらか一方の画面から保存しても、もう一方が既に設定した
// 値を silently 上書きしてはいけない(既存データを勝手に再解釈しない、
// section15)。そのため「呼び出し元がそのフィールドを送らなかった」場合は
// null(=未指定)を返し、SQL側でCOALESCE(?,既存値)により既存値を温存する。
// 実際に値が送られてきた場合だけ、その値で更新する。
const flagOrUnset = (value) => value === undefined ? null : Number(value === true);
const frequencyOrUnset = (value) => {
  if (value === undefined) return null;
  const normalized = String(value || '').trim().toUpperCase();
  return WATCH_FREQUENCIES.has(normalized) ? normalized : null;
};
// AIウォッチ(🔔ダイアログ、public/app.js createWatchOptions)は常に
// watch_sale/watch_price/watch_coupon/watch_restockの4つ全部を明示的な
// true/falseで送ってくる(未指定になることはない)ため、この関数の挙動は
// AIウォッチ側から見て今までと完全に同一(常に4値とも指定される=常に
// 上書きされる、今までどおり)。HOSHILU INSIGHT側(wishItem)はこれらの
// キーを送らないので、既存のAIウォッチ設定はCOALESCEにより温存される。
const prefs = (payload = {}) => ({
  watch_sale: flagOrUnset(payload.watch_sale),
  watch_price: flagOrUnset(payload.watch_price),
  watch_coupon: flagOrUnset(payload.watch_coupon),
  watch_restock: flagOrUnset(payload.watch_restock),
  watch_frequency: frequencyOrUnset(payload.watch_frequency),
  notify_new_match: flagOrUnset(payload.notify_new_match)
});
// section 6: 保存条件の最低限フィールド(元の検索文/正規化した検索文/AIが
// 理解した検索意図/カテゴリ/主要属性/価格条件/モール条件)をJSONとして
// 保持する。呼び出し元が何も渡さなければnull(=condition_snapshot列は
// COALESCEにより既存値を温存する)。
function conditionSnapshotFor(payload = {}, query = '') {
  if (payload.normalized_query_text === undefined && payload.search_intent === undefined
    && payload.category === undefined && payload.key_attributes === undefined
    && payload.price_condition === undefined && payload.marketplace_condition === undefined) return null;
  return serializeConditionSnapshot(buildConditionSnapshot({
    queryText: query,
    normalizedQueryText: payload.normalized_query_text,
    searchIntent: payload.search_intent,
    category: payload.category,
    keyAttributes: payload.key_attributes,
    priceCondition: payload.price_condition,
    marketplaceCondition: payload.marketplace_condition
  }));
}
async function makeId(memberId, query) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${memberId}:${query.toLowerCase()}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const validId = (value) => /^[a-f0-9]{32}$/.test(value);
const targetPriceOrUnset = (value) => {
  if (value === undefined) return null;
  const amount = Number(value);
  return Number.isInteger(amount) && amount >= 100 && amount <= 100000000 ? amount : false;
};
const targetTextOrUnset = (value, max = 200) => value === undefined ? null : clean(value).slice(0, max);
function savedPriceCondition(row) {
  try { return JSON.parse(row?.condition_snapshot || 'null')?.price_condition || {}; }
  catch { return {}; }
}
function retainedProductKey(key, name, previous) {
  // Older clients can still send an empty ID. Retain the known ID only when
  // they refer to the same product; never attach it to a changed product name.
  return key || ((!name || name === previous.target_product_name) ? String(previous.target_product_key || '') : '');
}
export const POST_PURCHASE_WATCH_DAYS = 30;

const LEGACY_WISH_SELECT_COLUMNS = 'wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at';
const WISH_SELECT_COLUMNS = `${LEGACY_WISH_SELECT_COLUMNS},insight_enabled_at`;
const isMissingInsightOptInColumn = (error) => /(?:no such column|has no column named).*insight_enabled_at/iu
  .test(String(error?.message || error));

async function withInsightSchema(primary, legacy) {
  try { return await primary(); }
  catch (error) {
    if (!isMissingInsightOptInColumn(error)) throw error;
    return legacy();
  }
}

async function selectWishRows(env, memberId) {
  return withInsightSchema(
    () => env.PRODUCT_DB.prepare(`SELECT ${WISH_SELECT_COLUMNS} FROM member_wishes WHERE member_id=?1 ORDER BY updated_at DESC LIMIT 100`).bind(memberId).all(),
    () => env.PRODUCT_DB.prepare(`SELECT ${LEGACY_WISH_SELECT_COLUMNS},NULL AS insight_enabled_at FROM member_wishes WHERE member_id=?1 ORDER BY updated_at DESC LIMIT 100`).bind(memberId).all()
  );
}

async function selectWish(env, memberId, wishId) {
  return withInsightSchema(
    () => env.PRODUCT_DB.prepare(`SELECT ${WISH_SELECT_COLUMNS} FROM member_wishes WHERE member_id=?1 AND wish_id=?2`).bind(memberId, wishId).first(),
    () => env.PRODUCT_DB.prepare(`SELECT ${LEGACY_WISH_SELECT_COLUMNS},NULL AS insight_enabled_at FROM member_wishes WHERE member_id=?1 AND wish_id=?2`).bind(memberId, wishId).first()
  );
}

async function selectWishEnablement(env, memberId, wishId) {
  return withInsightSchema(
    () => env.PRODUCT_DB.prepare('SELECT notify_new_match,watch_frequency,insight_enabled_at,updated_at FROM member_wishes WHERE member_id=?1 AND wish_id=?2').bind(memberId, wishId).first(),
    () => env.PRODUCT_DB.prepare('SELECT notify_new_match,watch_frequency,NULL AS insight_enabled_at,updated_at FROM member_wishes WHERE member_id=?1 AND wish_id=?2').bind(memberId, wishId).first()
  );
}

function nextInsightEnabledAt(watch, previous, now) {
  const resultingFrequency = String(watch.watch_frequency || previous?.watch_frequency || 'INSTANT').toUpperCase();
  if (watch.notify_new_match === 0 || resultingFrequency === 'MUTED') return null;
  if (watch.notify_new_match === 1) return now;
  return previous?.insight_enabled_at || null;
}

const optInSchemaPending = () => new Error('INSIGHT_OPT_IN_SCHEMA_PENDING');

async function cancelPendingInsightNotifications(env, memberId, wishId, now) {
  await env.PRODUCT_DB.prepare(`UPDATE mywatch_notifications
    SET status='CANCELLED',last_error_code='INSIGHT_DISABLED',updated_at=?3
    WHERE member_id=?1 AND wish_id=?2 AND event_type='INSIGHT_NEW_MATCH' AND status='PENDING'`
  ).bind(memberId, wishId, now).run();
}

function decorateWishRow(row) {
  if (!row) return row;
  const conditionSnapshot=row.condition_snapshot ? JSON.parse(row.condition_snapshot) : null;
  const price=conditionSnapshot?.price_condition||{};
  return { ...row, condition_snapshot: conditionSnapshot,
    target_price_jpy:Number(price.target_price_jpy)||null,
    target_product_key:String(price.target_product_key||''),
    target_product_name:String(price.target_product_name||''),
    watch_kind:String(price.kind||'TARGET_PRICE'),
    purchase_price_jpy:Number(price.purchase_price_jpy)||null,
    expires_at:String(price.expires_at||'') };
}

export async function handleMemberWishRoutes(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/member/wishes')) return null;
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'MEMBER_STORE_NOT_CONFIGURED' }, { status: 503 });
  const member = await readMemberSession(request, env);
  if (!member) return Response.json({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, { status: 401 });
  if (request.method === 'GET' && url.pathname === '/api/member/wishes') {
    const result = await selectWishRows(env, member.id);
    return Response.json({ ok: true, wishes: (result.results || []).map(decorateWishRow) }, { headers: { 'cache-control': 'no-store' } });
  }
  if (request.method === 'POST' && url.pathname === '/api/member/wishes') {
    const payload = await request.json(), query = clean(payload.query), language = LANGUAGES.has(payload.language) ? payload.language : 'JA';
    if (query.length < 2) return Response.json({ ok: false, error: 'WISH_QUERY_INVALID' }, { status: 400 });
    const wishId = await makeId(member.id, query), now = new Date().toISOString(), watch = prefs(payload);
    const previousEnablement = await selectWishEnablement(env, member.id, wishId);
    // 2026-09-05 夜 大隆さん決定「逆ウォッチ」: 買った直後の値下がりが一番悔しい。
    // watch_kind='POST_PURCHASE' と purchase_price_jpy を受けたら、買った価格より
    // 1円でも安くなったら通知する希望価格（購入価格-1）として同じ監視経路に乗せ、
    // 30日で自動的に期限切れにする（expires_at）。値下がり待ちの公開集計からは除く。
    const postPurchase = String(payload.watch_kind || '').toUpperCase() === 'POST_PURCHASE';
    const purchasePrice = postPurchase ? targetPriceOrUnset(payload.purchase_price_jpy) : null;
    if (postPurchase && (purchasePrice === null || purchasePrice === false || purchasePrice < 101)) {
      return Response.json({ ok: false, error: 'PURCHASE_PRICE_INVALID' }, { status: 400 });
    }
    const targetPrice = postPurchase ? purchasePrice - 1 : targetPriceOrUnset(payload.target_price_jpy);
    if (targetPrice === false) return Response.json({ ok: false, error: 'TARGET_PRICE_INVALID' }, { status: 400 });
    const targetProductKey = targetTextOrUnset(payload.target_product_key, 160);
    const targetProductName = targetTextOrUnset(payload.target_product_name, 200);
    const previousPrice = targetPrice === null ? {} : savedPriceCondition(await selectWish(env, member.id, wishId));
    const postPurchaseCondition = postPurchase ? { kind: 'POST_PURCHASE', purchase_price_jpy: purchasePrice,
      expires_at: new Date(Date.parse(now) + POST_PURCHASE_WATCH_DAYS * 86_400_000).toISOString() } : {};
    const targetPayload=targetPrice===null?payload:{...payload,price_condition:{...(payload.price_condition&&typeof payload.price_condition==='object'?payload.price_condition:{}),target_price_jpy:targetPrice,target_product_key:retainedProductKey(targetProductKey,targetProductName,previousPrice),target_product_name:targetProductName||previousPrice.target_product_name||query,...postPurchaseCondition}};
    const conditionSnapshot = conditionSnapshotFor(targetPayload, query);
    // 0044のnotify_new_match DEFAULT 1だけでは、本人が新着通知を明示的に
    // 有効化したか判別できない。新規の通常保存はOFFにし、明示ONかつMUTED
    // 以外のときだけ0065のinsight_enabled_atへ監査可能な時刻を保存する。
    const insightEnabledAt = nextInsightEnabledAt(watch, previousEnablement, now);
    const bindValues = [member.id, wishId, query, language, watch.watch_sale, watch.watch_price,
      watch.watch_coupon, watch.watch_restock, watch.watch_frequency, watch.notify_new_match,
      conditionSnapshot, insightEnabledAt, now];
    try {
      await withInsightSchema(
        () => env.PRODUCT_DB.prepare(
        `INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,insight_enabled_at,created_at,updated_at)
        VALUES(?1,?2,?3,?4,COALESCE(?5,1),COALESCE(?6,1),COALESCE(?7,0),COALESCE(?8,0),COALESCE(?9,'INSTANT'),COALESCE(?10,0),?11,?12,?13,?13)
        ON CONFLICT(member_id,wish_id) DO UPDATE SET
          query_text=excluded.query_text,
          language=excluded.language,
          watch_sale=COALESCE(?5,member_wishes.watch_sale),
          watch_price=COALESCE(?6,member_wishes.watch_price),
          watch_coupon=COALESCE(?7,member_wishes.watch_coupon),
          watch_restock=COALESCE(?8,member_wishes.watch_restock),
          watch_frequency=COALESCE(?9,member_wishes.watch_frequency),
          notify_new_match=COALESCE(?10,member_wishes.notify_new_match),
          condition_snapshot=COALESCE(?11,member_wishes.condition_snapshot),
          insight_enabled_at=?12,
          updated_at=excluded.updated_at`
        ).bind(...bindValues).run(),
        () => {
          if (watch.notify_new_match === 1 && insightEnabledAt) throw optInSchemaPending();
          return env.PRODUCT_DB.prepare(
        `INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at)
        VALUES(?1,?2,?3,?4,COALESCE(?5,1),COALESCE(?6,1),COALESCE(?7,0),COALESCE(?8,0),COALESCE(?9,'INSTANT'),COALESCE(?10,0),?11,?12,?12)
        ON CONFLICT(member_id,wish_id) DO UPDATE SET
          query_text=excluded.query_text,
          language=excluded.language,
          watch_sale=COALESCE(?5,member_wishes.watch_sale),
          watch_price=COALESCE(?6,member_wishes.watch_price),
          watch_coupon=COALESCE(?7,member_wishes.watch_coupon),
          watch_restock=COALESCE(?8,member_wishes.watch_restock),
          watch_frequency=COALESCE(?9,member_wishes.watch_frequency),
          notify_new_match=COALESCE(?10,member_wishes.notify_new_match),
          condition_snapshot=COALESCE(?11,member_wishes.condition_snapshot),
          updated_at=excluded.updated_at`
          ).bind(...bindValues.slice(0, 11), now).run();
        }
      );
    } catch (error) {
      if (String(error?.message || error) === 'INSIGHT_OPT_IN_SCHEMA_PENDING') {
        return Response.json({ ok: false, error: 'INSIGHT_OPT_IN_TEMPORARILY_UNAVAILABLE' }, { status: 503 });
      }
      throw error;
    }
    if (targetPrice !== null) await env.PRODUCT_DB.prepare(`DELETE FROM search_watch_matches
      WHERE member_id=?1 AND wish_id=?2 AND product_identity_key IN ('TARGET_PRICE_CHECK','TARGET_PRICE_REACHED')`).bind(member.id,wishId).run();
    const saved = await selectWish(env, member.id, wishId);
    if (!saved?.insight_enabled_at || !saved?.notify_new_match || saved?.watch_frequency === 'MUTED') {
      await cancelPendingInsightNotifications(env, member.id, wishId, now);
    }
    // 2026-09-06 大隆さん指示（§27）: 「訪問→Watch Set率」と流入元を出せるようにする。
    // 希望価格を入れた保存のときだけ、流入元と匿名の visitor/session を1件残す
    // （会員ID・商品名・金額は入れない。同じウォッチは何度保存しても1件）。
    // 失敗しても保存自体は成功として返す（計測が本体を止めない）。
    if (targetPrice !== null) {
      try {
        await recordTargetPriceWatchSet(env, {
          memberId: member.id, wishId, locale: saved?.language || language,
          attribution: payload, visitorId: payload.visitor_id, sessionId: payload.session_id
        });
      } catch (error) { console.warn('TARGET_PRICE_WATCH_SET_EVENT_FAILED', String(error?.name || 'Error').slice(0, 40)); }
    }
    if (Boolean(saved?.insight_enabled_at) && !Boolean(previousEnablement?.insight_enabled_at)) {
      const deduplicationKey = `${member.id}:${wishId}:${previousEnablement?.updated_at || 'initial'}`;
      try { await recordContinuousSearchEnabled(env, { locale: saved.language, deduplicationKey }); }
      catch (error) { console.warn('CONTINUOUS_SEARCH_ENABLE_EVENT_FAILED', String(error?.name || 'Error').slice(0, 40)); }
    }
    return Response.json({ ok: true, wish: decorateWishRow(saved) });
  }
  const wishId = url.pathname.split('/').pop();
  if (!validId(wishId)) return Response.json({ ok: false, error: 'WISH_ID_INVALID' }, { status: 400 });
  if (request.method === 'PATCH') {
    const payload = await request.json(), watch = prefs(payload), now = new Date().toISOString();
    const previousEnablement = await selectWishEnablement(env, member.id, wishId);
    const targetPrice = targetPriceOrUnset(payload.target_price_jpy);
    if (targetPrice === false) return Response.json({ ok: false, error: 'TARGET_PRICE_INVALID' }, { status: 400 });
    const targetProductKey = targetTextOrUnset(payload.target_product_key, 160);
    const targetProductName = targetTextOrUnset(payload.target_product_name, 200);
    const existingForSnapshot = (payload.normalized_query_text !== undefined || payload.search_intent !== undefined
      || payload.category !== undefined || payload.key_attributes !== undefined
      || payload.price_condition !== undefined || payload.marketplace_condition !== undefined || targetPrice !== null)
      ? await env.PRODUCT_DB.prepare('SELECT query_text,condition_snapshot FROM member_wishes WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId).first()
      : null;
    const previousPrice = savedPriceCondition(existingForSnapshot);
    const targetPayload=targetPrice===null?payload:{...payload,price_condition:{...previousPrice,...(payload.price_condition&&typeof payload.price_condition==='object'?payload.price_condition:{}),target_price_jpy:targetPrice,target_product_key:retainedProductKey(targetProductKey,targetProductName,previousPrice),target_product_name:targetProductName||previousPrice.target_product_name||existingForSnapshot?.query_text||''}};
    const conditionSnapshot = existingForSnapshot ? conditionSnapshotFor(targetPayload, existingForSnapshot.query_text) : null;
    const insightEnabledAt = nextInsightEnabledAt(watch, previousEnablement, now);
    const updateValues = [member.id, wishId, watch.watch_sale, watch.watch_price,
      watch.watch_coupon, watch.watch_restock, watch.watch_frequency, watch.notify_new_match,
      conditionSnapshot, insightEnabledAt, now];
    let result;
    try {
      result = await withInsightSchema(
        () => env.PRODUCT_DB.prepare(
        `UPDATE member_wishes SET
          watch_sale=COALESCE(?3,watch_sale),
          watch_price=COALESCE(?4,watch_price),
          watch_coupon=COALESCE(?5,watch_coupon),
          watch_restock=COALESCE(?6,watch_restock),
          watch_frequency=COALESCE(?7,watch_frequency),
          notify_new_match=COALESCE(?8,notify_new_match),
          condition_snapshot=COALESCE(?9,condition_snapshot),
          insight_enabled_at=?10,
          updated_at=?11
        WHERE member_id=?1 AND wish_id=?2`
        ).bind(...updateValues).run(),
        () => {
          if (watch.notify_new_match === 1 && insightEnabledAt) throw optInSchemaPending();
          return env.PRODUCT_DB.prepare(
        `UPDATE member_wishes SET
          watch_sale=COALESCE(?3,watch_sale),
          watch_price=COALESCE(?4,watch_price),
          watch_coupon=COALESCE(?5,watch_coupon),
          watch_restock=COALESCE(?6,watch_restock),
          watch_frequency=COALESCE(?7,watch_frequency),
          notify_new_match=COALESCE(?8,notify_new_match),
          condition_snapshot=COALESCE(?9,condition_snapshot),
          updated_at=?10
        WHERE member_id=?1 AND wish_id=?2`
          ).bind(...updateValues.slice(0, 9), now).run();
        }
      );
    } catch (error) {
      if (String(error?.message || error) === 'INSIGHT_OPT_IN_SCHEMA_PENDING') {
        return Response.json({ ok: false, error: 'INSIGHT_OPT_IN_TEMPORARILY_UNAVAILABLE' }, { status: 503 });
      }
      throw error;
    }
    if (targetPrice !== null) await env.PRODUCT_DB.prepare(`DELETE FROM search_watch_matches
      WHERE member_id=?1 AND wish_id=?2 AND product_identity_key IN ('TARGET_PRICE_CHECK','TARGET_PRICE_REACHED')`).bind(member.id,wishId).run();
    if (!Number(result?.meta?.changes || 0)) return Response.json({ ok: false, error: 'WISH_NOT_FOUND' }, { status: 404 });
    const saved = await selectWish(env, member.id, wishId);
    if (!saved?.insight_enabled_at || !saved?.notify_new_match || saved?.watch_frequency === 'MUTED') {
      await cancelPendingInsightNotifications(env, member.id, wishId, now);
    }
    if (Boolean(saved?.insight_enabled_at) && previousEnablement && !Boolean(previousEnablement.insight_enabled_at)) {
      const deduplicationKey = `${member.id}:${wishId}:${previousEnablement.updated_at || 'legacy-off'}`;
      try { await recordContinuousSearchEnabled(env, { locale: saved.language, deduplicationKey }); }
      catch (error) { console.warn('CONTINUOUS_SEARCH_ENABLE_EVENT_FAILED', String(error?.name || 'Error').slice(0, 40)); }
    }
    return Response.json({ ok: true, wish: decorateWishRow(saved) });
  }
  if (request.method === 'DELETE') {
    const existing = await env.PRODUCT_DB.prepare('SELECT language,watch_sale,watch_price,watch_coupon,watch_restock FROM member_wishes WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId).first();
    if (existing) await env.PRODUCT_DB.batch([
      env.PRODUCT_DB.prepare('INSERT INTO member_wish_events(event_id,event_type,language,watch_sale,watch_price,watch_coupon,watch_restock,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)').bind(crypto.randomUUID(), 'DELETED_BY_MEMBER', existing.language, existing.watch_sale, existing.watch_price, existing.watch_coupon, existing.watch_restock, new Date().toISOString()),
      env.PRODUCT_DB.prepare('DELETE FROM mywatch_notifications WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId),
      env.PRODUCT_DB.prepare('DELETE FROM search_watch_matches WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId),
      env.PRODUCT_DB.prepare('DELETE FROM member_wishes WHERE member_id=?1 AND wish_id=?2').bind(member.id, wishId)
    ]);
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}
