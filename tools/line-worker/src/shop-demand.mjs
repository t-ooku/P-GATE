// 2026-09-17 大隆さん「HOSHILU SHOP全面強化」指示書 P0（docs/handoff/2026-09-17-shop-directive.md）
//
//   全ショップ横断検索 → 条件一致 / 近い商品 / 見つからない の3段階
//   → 見つからなければ「探し中需要」として保存（ホシっとく）
//   → Seller Dashboard に匿名集計で「HOSHILUで今探されているもの」
//   → Seller が商品を登録・紐付け → HOSHILU が条件を再判定（自己申告では一致にしない）
//   → 一致したら本人に「探していた商品が見つかりました」通知
//
// 原則（§6/§41）: 一致・不一致は商品名に明記された語だけで判定し、何が一致して何が一致していないかを返す。
// AI の推測で一致率を作らない。商品・価格・URL・ショップ名を推測で生成しない（すべて D1 の取得済みデータ）。

import { activeShops, publicShopRef, recordShopEvent, SHOP_GENRES, shopFilters } from './seller-shop.mjs';
import { searchProductsV2 } from './product-index-v2.mjs';
import { readMemberSession } from './member-auth.mjs';
import { demandMatchProductUrl } from './seller-demand-match.mjs';
import { SHOP_COLOR_FILTERS, SHOP_MATERIAL_FILTERS, shopAttributeDefinition } from './shop-facets.mjs';

const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g');
const clean = (value, max) => String(value ?? '').normalize('NFKC').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const httpsUrl = (value) => { const v = clean(value, 500); return /^https:\/\//i.test(v) ? v : ''; };
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export const DEMAND_QUERY_MIN = 2;
export const DEMAND_QUERY_MAX = 120;
export const SHOP_DEMAND_EVENT_TYPE = 'SHOP_DEMAND_MATCH';
const SIZE_PATTERN = /(?:XXS|XS|S|M|L|XL|XXL|3XL)サイズ|サイズ\s*(?:XXS|XS|S|M|L|XL|XXL|3XL)|フリーサイズ|[AB][3-6]|\d{1,4}(?:\.\d{1,2})?\s*(?:mm|cm|ml|L|g|kg|インチ|型|号|合|畳|枚|個|本|人用)/giu;
const KEYWORD_PATTERN = /[ァ-ヴー]{2,14}|[一-龥]{2,6}|[A-Za-z][A-Za-z0-9-]{1,15}/gu;
// 条件にならない語（意図の言い回し・汎用語）
const KEYWORD_STOP = new Set(['商品', 'もの', 'やつ', '欲しい', '探して', 'ください', '感じ', '限定', 'おしゃれ', 'かわいい', '人気', 'おすすめ', 'セット', 'タイプ', 'サイズ', 'カラー', 'ブランド', 'メーカー', 'the', 'and', 'for', 'with']);

// ---- 条件の抽出と判定（純関数） ---------------------------------------------------
function normalizeForMatch(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
}

export function demandKey(query) {
  return clean(query, DEMAND_QUERY_MAX).toLowerCase().replace(/[\s　、。,.!！?？・/／]+/gu, ' ').trim().slice(0, DEMAND_QUERY_MAX);
}

// 検索文から「商品名に明記されているか」で判定できる条件だけを取り出す。
// 色・素材は既存の絞り込み定義（別名つき）、サイズは表記そのもの、残りは名詞らしい語。
export function demandConditions(query) {
  const source = clean(query, DEMAND_QUERY_MAX);
  const lower = source.toLowerCase();
  const conditions = [];
  const used = [];
  const add = (condition) => {
    if (conditions.length >= 8) return;
    if (conditions.some((item) => item.label === condition.label)) return;
    conditions.push(condition);
  };
  for (const kind of ['color', 'material']) {
    const definitions = kind === 'color' ? SHOP_COLOR_FILTERS : SHOP_MATERIAL_FILTERS;
    for (const definition of definitions) {
      const alias = definition.aliases.find((item) => lower.includes(String(item).toLowerCase()));
      if (!alias) continue;
      add({ kind, label: definition.query, aliases: [...definition.aliases] });
      used.push(String(alias).toLowerCase());
    }
  }
  for (const match of source.match(SIZE_PATTERN) || []) {
    const label = match.replace(/\s+/gu, '');
    add({ kind: 'size', label, aliases: [label] });
    used.push(label.toLowerCase());
  }
  const explicitWords = source.split(/[\s　、。,.!！?？・/／]+/u).map((word) => word.trim()).filter((word) => word.length >= 2);
  const tokens = [...(source.match(KEYWORD_PATTERN) || []), ...explicitWords.filter((word) => /^[ぁ-ん]+$/u.test(word) && word.length >= 3)];
  for (const raw of tokens) {
    const token = raw.trim();
    const lowered = token.toLowerCase();
    if (token.length < 2 || KEYWORD_STOP.has(token) || KEYWORD_STOP.has(lowered)) continue;
    if (used.some((alias) => lowered.includes(alias) || alias.includes(lowered))) continue;
    if (/^\d+$/u.test(token)) continue;
    add({ kind: 'keyword', label: token, aliases: [token] });
  }
  return conditions;
}

// 2026-09-17 大隆さん指示: 総合検索にもジャンル・詳細条件（色・サイズ・素材・ブランド）。選んだ条件は
// 検索文の条件と同じ扱い（商品名に明記されているかで判定）。ジャンルは小ジャンルの語のどれかが入っていれば一致。
export function filterConditions(filters = {}) {
  const conditions = [];
  if (filters.subgenre && Array.isArray(filters.subgenre_terms) && filters.subgenre_terms.length) {
    conditions.push({ kind: 'genre', label: filters.subgenre_label || filters.subgenre, aliases: [...filters.subgenre_terms] });
  }
  for (const kind of ['color', 'material']) {
    const definition = shopAttributeDefinition(kind, filters[kind]);
    if (definition) conditions.push({ kind, label: definition.query, aliases: [...definition.aliases] });
  }
  const size = shopAttributeDefinition('size', filters.size);
  if (size) conditions.push({ kind: 'size', label: size.label, aliases: [size.value] });
  for (const brand of Array.isArray(filters.brands) ? filters.brands.slice(0, 3) : []) {
    if (brand) conditions.push({ kind: 'brand', label: brand, aliases: [brand] });
  }
  return conditions;
}

export function mergeConditions(base, extra) {
  const merged = [...base];
  for (const condition of extra) {
    if (merged.some((item) => item.label === condition.label || (condition.kind !== 'genre' && item.aliases.some((alias) => condition.aliases.includes(alias))))) continue;
    merged.push(condition);
  }
  return merged.slice(0, 10);
}

export function shopSearchFilterCatalog() {
  return {
    genres: SHOP_GENRES.map((genre) => ({ label: genre.label, subgenres: genre.subgenres.map((item) => ({ label: item.label, query: item.query })) })),
    colors: SHOP_COLOR_FILTERS.map((item) => ({ value: item.value, label: item.label })),
    materials: SHOP_MATERIAL_FILTERS.map((item) => ({ value: item.value, label: item.label }))
  };
}

export function judgeTitle(title, conditions) {
  const source = normalizeForMatch(title);
  const matched = [];
  const unmatched = [];
  for (const condition of conditions) {
    const hit = condition.aliases.some((alias) => alias && source.includes(normalizeForMatch(alias)));
    (hit ? matched : unmatched).push(condition.label);
  }
  const total = conditions.length;
  let level = 'NONE';
  if (total > 0 && unmatched.length === 0) level = 'EXACT';
  else if (total > 0 && matched.length >= Math.ceil(total / 2) && matched.length >= 1) level = 'NEAR';
  return { level, matched, unmatched };
}

export function conditionLabels(conditions) {
  return conditions.map((item) => item.label);
}

// ---- 横断検索 -------------------------------------------------------------------
function candidateCard(row, shop, verdict) {
  const offers = Array.isArray(row.offers) ? row.offers : [];
  const priced = offers.find((offer) => Number(offer?.price) > 0);
  const url = httpsUrl(row.amazon_jp_url) || httpsUrl(priced?.product_url) || httpsUrl(offers[0]?.product_url);
  if (!url) return null;
  return {
    name: clean(row.product_name, 160),
    image: httpsUrl(row.image_url),
    url,
    price: Number(priced?.price) > 0 ? Number(priced.price) : 0,
    asin: clean(row.asin, 20),
    record_key: clean(row.record_key, 160),
    marketplace: clean(priced?.marketplace || 'AMAZON_JP', 20),
    shop: publicShopRef(shop),
    level: verdict.level,
    matched: verdict.matched,
    unmatched: verdict.unmatched
  };
}

// 取り出しは広めに（FTS は全語 AND なので、条件を落とした語でも引く）。判定は judgeTitle が厳密に行う。
async function retrieveCandidates(env, tenant, text, conditions, limit) {
  const queries = text ? [text] : [];
  const keywords = conditions.filter((item) => item.kind === 'keyword').map((item) => item.label);
  if (keywords.length && keywords.join(' ') !== text) queries.push(keywords.join(' '));
  for (const keyword of keywords.slice(0, 3)) if (!queries.includes(keyword)) queries.push(keyword);
  const merged = new Map();
  for (const query of queries.slice(0, 5)) {
    let rows = [];
    try { rows = (await searchProductsV2(env, tenant, query, limit)) || []; } catch { rows = []; }
    for (const row of rows) {
      const key = String(row?.record_key || row?.asin || row?.amazon_jp_url || '');
      if (key && !merged.has(key)) merged.set(key, row);
    }
    if (merged.size >= limit * 2) break;
  }
  // FTS は英語の同義語索引（search_aliases）に依存するので、商品名そのものの部分一致でも拾う（ショップページの絞り込みと同じ方式）。
  const genreTerms = conditions.filter((item) => item.kind === 'genre').flatMap((item) => item.aliases.slice(0, 2));
  const likeTerms = [...new Set([...keywords, ...genreTerms].length ? [...keywords, ...genreTerms] : conditions.map((item) => item.label))].slice(0, 3);
  if (likeTerms.length && env?.PRODUCT_DB) {
    try {
      const binds = [tenant, ...likeTerms.map((term) => `%${term}%`)];
      const where = likeTerms.map((_, index) => `product_name LIKE ?${index + 2}`).join(' OR ');
      const rows = await env.PRODUCT_DB.prepare(`SELECT * FROM products WHERE tenant=?1 AND stock>0 AND amazon_jp_url<>'' AND (${where}) ORDER BY imported_at DESC LIMIT ${Math.max(20, limit)}`).bind(...binds).all();
      for (const row of rows.results || []) {
        const key = String(row?.record_key || row?.asin || row?.amazon_jp_url || '');
        if (key && !merged.has(key)) merged.set(key, row);
      }
    } catch {}
  }
  return [...merged.values()];
}

export async function searchAcrossShops(env, query, { limitPerTenant = 40, shops = null, filters = null } = {}) {
  const db = env?.PRODUCT_DB;
  const text = clean(query, DEMAND_QUERY_MAX);
  const extra = filters ? filterConditions(filters) : [];
  const conditions = mergeConditions(demandConditions(text), extra);
  const asin = /^[A-Z0-9]{10}$/u.test(text.toUpperCase()) && !extra.length ? text.toUpperCase() : '';
  // 需要として預かる時の文: 入力文＋選んだ条件（再判定でも同じ条件が復元できる）
  const demandQuery = clean([text, ...extra.map((item) => item.label)].filter(Boolean).join(' '), DEMAND_QUERY_MAX);
  const result = { query: text, demand_query: demandQuery, conditions: conditionLabels(conditions), exact: [], near: [], shops_searched: 0 };
  if (!db || !conditions.length) return result;
  const list = shops || await activeShops(env);
  const seen = new Set();
  for (const shop of list) {
    result.shops_searched += 1;
    for (const tenant of shop.tenants.slice(0, 5)) {
      let rows = [];
      try {
        if (asin) {
          const found = await db.prepare(`SELECT product_name,image_url,amazon_jp_url,asin,record_key,stock FROM products WHERE tenant=?1 AND asin=?2 AND amazon_jp_url<>'' LIMIT 5`).bind(tenant, asin).all();
          rows = found.results || [];
        } else {
          rows = await retrieveCandidates(env, tenant, text, conditions, limitPerTenant);
        }
      } catch { rows = []; }
      for (const row of rows) {
        if (Number(row.stock ?? 1) <= 0) continue;
        const verdict = asin ? { level: 'EXACT', matched: [asin], unmatched: [] } : judgeTitle(`${row.product_name} ${row.manufacturer || ''}`, conditions);
        if (verdict.level === 'NONE') continue;
        const card = candidateCard(row, shop, verdict);
        if (!card || seen.has(card.url)) continue;
        seen.add(card.url);
        (verdict.level === 'EXACT' ? result.exact : result.near).push(card);
      }
    }
  }
  const byMatches = (a, b) => b.matched.length - a.matched.length || a.unmatched.length - b.unmatched.length;
  result.exact = result.exact.slice(0, 30);
  result.near = result.near.sort(byMatches).slice(0, 30);
  return result;
}

export function resultState(result) {
  if (result.exact.length) return 'EXACT';
  if (result.near.length) return 'NEAR';
  return 'NONE';
}

// ---- 匿名ハッシュ・保存 ----------------------------------------------------------
async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function visitorHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const salt = String(env?.GROWTH_HASH_SALT || env?.MEMBER_SESSION_SECRET || 'hoshilu');
  return (await sha256Hex(`${salt}|${ip}|${ua}|${day}`)).slice(0, 32);
}

// 需要として保存してよい文か（個人情報らしいものは保存しない）
export function demandQueryProblem(query) {
  const text = clean(query, DEMAND_QUERY_MAX + 1);
  if (text.length < DEMAND_QUERY_MIN) return 'QUERY_TOO_SHORT';
  if (text.length > DEMAND_QUERY_MAX) return 'QUERY_TOO_LONG';
  if (/@|https?:\/\/|www\./iu.test(text)) return 'QUERY_CONTAINS_CONTACT';
  if (/\d[\d-]{8,}\d/u.test(text)) return 'QUERY_CONTAINS_NUMBER';
  return '';
}

async function logSearch(db, { text, result, visitor }) {
  try {
    await db.prepare(`INSERT INTO shop_search_log(log_id,demand_key,query_text,result_state,exact_count,near_count,visitor_hash,created_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`)
      .bind(crypto.randomUUID(), demandKey(text), text, resultState(result), result.exact.length, result.near.length, visitor, new Date().toISOString()).run();
  } catch {}
}

async function saveDemand(db, { text, memberId, visitor, sellerKey, state, conditions }) {
  const now = new Date().toISOString();
  const demandId = `sd-${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO shop_demand_requests(demand_id,demand_key,query_text,conditions_json,member_id,visitor_hash,seller_key,result_state,status,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'OPEN',?9,?9)`)
    .bind(demandId, demandKey(text), text, JSON.stringify(conditionLabels(conditions)), memberId || '', visitor, sellerKey || '', state, now).run();
  return demandId;
}

// ---- 一致後の通知 ---------------------------------------------------------------
async function externalChannels(db, memberId) {
  try {
    const rows = await db.prepare(`SELECT channel FROM member_notification_destinations WHERE member_id=?1 AND channel IN ('LINE','EMAIL') AND verified_at<>''`).bind(memberId).all();
    return [...new Set((rows.results || []).map((row) => String(row.channel || '')).filter((channel) => channel === 'LINE' || channel === 'EMAIL'))];
  } catch { return []; }
}

export function demandResultUrl(query) {
  return `https://hoshilu.app/?shop_search=${encodeURIComponent(clean(query, DEMAND_QUERY_MAX))}#tab-shops`;
}

export async function notifyDemandMatch(env, demand, { shop, card, level, now = new Date().toISOString() }) {
  const db = env.PRODUCT_DB;
  const memberId = String(demand.member_id || '');
  if (!memberId) return { queued: false, notificationId: '' };
  const shopName = String(shop?.name || card?.shop?.name || 'ショップ');
  const title = '探していた商品が見つかりました';
  const body = `「${demand.query_text}」\n${shopName}に${level === 'EXACT' ? '条件に一致する' : '近い'}商品が追加されました。`;
  // 2026-09-19 大隆さん指示 §2・§10・§11: 通知のリンク先は Seller 専用商品ページ（署名付き）。本人が通知から
  // その商品を開いた時だけ Demand Match Click（50円）。ショップ・ASIN が無い時は従来の検索結果へ。
  let resultUrl = demandResultUrl(demand.query_text);
  const slug = String(shop?.slug || card?.shop?.slug || '');
  const asin = clean(card?.asin, 20).toUpperCase();
  if (slug && /^[A-Z0-9]{10}$/u.test(asin) && shop?.seller_key) {
    try { resultUrl = await demandMatchProductUrl(env, { slug, asin, demandId: demand.demand_id, memberId, sellerKey: shop.seller_key }); } catch {}
  }
  const notificationId = `shopdemand-${String(demand.demand_id).replace(/[^A-Za-z0-9-]/g, '').slice(0, 48)}`;
  const eventKey = `SHOPDEMAND:${demand.demand_id}`.slice(0, 160);
  const statements = [db.prepare(`INSERT OR IGNORE INTO mywatch_notifications
    (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url,result_url)
    VALUES(?1,?2,?3,?4,?5,'WEB',?6,?7,'DELIVERED',1,?8,?8,?8,?8,?9,?10,?11,?12)`)
    .bind(notificationId, memberId, demand.demand_id, eventKey, SHOP_DEMAND_EVENT_TYPE, title, body, now, clean(card?.asin, 20), clean(card?.marketplace || 'AMAZON_JP', 20), httpsUrl(card?.image), resultUrl)];
  const externalBody = `${body}\n\n商品を見る\n${resultUrl}`;
  for (const channel of await externalChannels(db, memberId)) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO mywatch_notifications
      (notification_id,member_id,wish_id,event_key,event_type,channel,title,body,status,attempts,next_attempt_at,delivered_at,created_at,updated_at,asin,marketplace,image_url,result_url)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'PENDING',0,?9,NULL,?9,?9,?10,?11,?12,?13)`)
      .bind(`${notificationId}-${channel.toLowerCase()}`, memberId, demand.demand_id, eventKey, SHOP_DEMAND_EVENT_TYPE, channel, title, externalBody, now, clean(card?.asin, 20), clean(card?.marketplace || 'AMAZON_JP', 20), httpsUrl(card?.image), resultUrl));
  }
  const results = await db.batch(statements);
  return { queued: Number(results?.[0]?.meta?.changes || 0) > 0, notificationId };
}

async function markMatched(db, demand, { shop, card, level, notificationId, now }) {
  await db.prepare(`UPDATE shop_demand_requests SET status='MATCHED',matched_at=?2,matched_seller_key=?3,matched_shop_slug=?4,matched_product_url=?5,matched_level=?6,notification_id=?7,last_checked_at=?2,updated_at=?2
    WHERE demand_id=?1 AND status='OPEN'`)
    .bind(demand.demand_id, now, String(shop?.seller_key || ''), String(shop?.slug || card?.shop?.slug || ''), String(card?.url || ''), level, notificationId || '').run();
  await recordShopEvent({ PRODUCT_DB: db }, 'shop_demand_matched', String(shop?.slug || card?.shop?.slug || ''), { content: level });
}

// 1件の探し中需要を再判定する。EXACT はいつでも一致、NEAR は保存時に何も無かった需要だけ「近い商品が追加」として扱う。
export async function rematchDemand(env, demand, { now = new Date().toISOString(), search = searchAcrossShops } = {}) {
  const db = env.PRODUCT_DB;
  const result = await search(env, demand.query_text);
  const shops = await activeShops(env);
  const pick = result.exact[0] ? { card: result.exact[0], level: 'EXACT' }
    : (demand.result_state === 'NONE' && result.near[0] ? { card: result.near[0], level: 'NEAR' } : null);
  if (!pick) {
    await db.prepare(`UPDATE shop_demand_requests SET last_checked_at=?2,updated_at=?2 WHERE demand_id=?1`).bind(demand.demand_id, now).run();
    return { matched: false };
  }
  const shop = shops.find((item) => item.slug === pick.card.shop?.slug) || null;
  const notified = await notifyDemandMatch(env, demand, { shop, card: pick.card, level: pick.level, now });
  await markMatched(db, demand, { shop, card: pick.card, level: pick.level, notificationId: notified.notificationId, now });
  return { matched: true, level: pick.level, notified: notified.queued };
}

export async function runShopDemandRematch(env, now = new Date().toISOString(), { limit = 15, search = searchAcrossShops } = {}) {
  const db = env?.PRODUCT_DB;
  if (!db) return { scanned: 0, matched: 0 };
  let rows;
  try {
    rows = await db.prepare(`SELECT * FROM shop_demand_requests WHERE status='OPEN' AND created_at>=datetime('now','-90 days') ORDER BY last_checked_at ASC, created_at ASC LIMIT ?1`).bind(limit).all();
  } catch { return { scanned: 0, matched: 0 }; }
  let matched = 0;
  for (const demand of rows.results || []) {
    try {
      const outcome = await rematchDemand(env, demand, { now, search });
      if (outcome.matched) matched += 1;
    } catch {}
  }
  return { scanned: (rows.results || []).length, matched };
}

// ---- 公開ルート -------------------------------------------------------------------
// GET  /api/shops/search?q=…        横断検索（匿名ログを1行残す）
// POST /api/shops/demand            探し中需要を保存 {query, seller_slug?, result_state?}
// POST /api/shops/demand/claim      未ログイン時に保存した需要を会員に紐付け {demand_ids:[…]}
// GET  /api/shops/demand/popular    みんなが今探しているもの（匿名集計、2人以上）
export async function handleShopDemandRoutes(request, env, { readMember = readMemberSession } = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/shops/')) return null;
  const db = env?.PRODUCT_DB;
  if (request.method === 'GET' && url.pathname === '/api/shops/filters') {
    return Response.json({ ok: true, ...shopSearchFilterCatalog() }, { headers: { 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } });
  }
  if (request.method === 'GET' && url.pathname === '/api/shops/search') {
    const text = clean(url.searchParams.get('q'), DEMAND_QUERY_MAX);
    const filters = shopFilters(url.searchParams);
    const hasFilters = filterConditions(filters).length > 0;
    if (text.length < DEMAND_QUERY_MIN && !hasFilters) return json({ ok: false, error: 'QUERY_TOO_SHORT' }, 400);
    const result = await searchAcrossShops(env, text, { filters });
    if (db) await logSearch(db, { text: result.demand_query, result, visitor: await visitorHash(request, env) });
    // §17 KPI: 横断検索の結果区分（EXACT / NEAR / NONE）。campaign に区分、content に一致件数（検索文は入れない）
    await recordShopEvent(env, 'shop_search_completed', resultState(result), { content: `${result.exact.length}/${result.near.length}` });
    return json({ ok: true, ...result, state: resultState(result) });
  }
  // 2026-09-19 大隆さん指示 §8: /for-sellers の「今、HOSHILUで探されています」。同じ条件を SELLER_DEMAND_MIN_PEOPLE（5）人以上が
  // 探している需要だけを、検索文ではなく正規化した条件で返す（架空件数なし・個人情報なし）。件数未満は個別に出さない。
  if (request.method === 'GET' && url.pathname === '/api/shops/demand/public') {
    const minPeople = Number(env?.SHOP_DEMAND_SELLER_MIN_PEOPLE) || SELLER_DEMAND_MIN_PEOPLE;
    if (!db) return json({ ok: true, items: [], min_people: minPeople });
    try {
      const rows = await db.prepare(`SELECT demand_key, MIN(conditions_json) AS conditions_json,
          COUNT(DISTINCT CASE WHEN member_id<>'' THEN member_id ELSE visitor_hash END) AS people,
          SUM(CASE WHEN result_state='NONE' THEN 1 ELSE 0 END) AS zero_results,
          SUM(CASE WHEN result_state='NEAR' THEN 1 ELSE 0 END) AS near_only,
          MAX(created_at) AS last_at
        FROM shop_demand_requests WHERE created_at>=datetime('now','-60 days')
        GROUP BY demand_key HAVING people>=?1 ORDER BY people DESC, last_at DESC LIMIT 12`).bind(minPeople).all();
      const items = (rows.results || []).map((row) => {
        let conditions = [];
        try { conditions = JSON.parse(row.conditions_json || '[]'); } catch { conditions = []; }
        return {
          conditions: Array.isArray(conditions) && conditions.length ? conditions.map((item) => clean(item, 40)).filter(Boolean).join('・') : '',
          people: Number(row.people || 0), zero_results: Number(row.zero_results || 0), near_only: Number(row.near_only || 0)
        };
      }).filter((item) => item.conditions);
      return Response.json({ ok: true, items, min_people: minPeople },
        { headers: { 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    } catch { return json({ ok: true, items: [], min_people: minPeople }); }
  }
  if (request.method === 'GET' && url.pathname === '/api/shops/demand/popular') {
    if (!db) return json({ ok: true, items: [] });
    try {
      const rows = await db.prepare(`SELECT demand_key, MIN(query_text) AS query_text, COUNT(DISTINCT CASE WHEN member_id<>'' THEN member_id ELSE visitor_hash END) AS people
        FROM shop_demand_requests WHERE created_at>=datetime('now','-30 days') GROUP BY demand_key HAVING people>=2 ORDER BY people DESC, MAX(created_at) DESC LIMIT 10`).all();
      return Response.json({ ok: true, items: (rows.results || []).map((row) => ({ query: String(row.query_text || ''), people: Number(row.people || 0) })) },
        { headers: { 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    } catch { return json({ ok: true, items: [] }); }
  }
  if (request.method === 'GET' && url.pathname === '/api/shops/demand/mine') {
    const member = await readMember(request, env);
    if (!member?.id) return json({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, 401);
    return json({ ok: true, items: await memberDemands(env, member.id) });
  }
  const closeMatch = url.pathname.match(/^\/api\/shops\/demand\/(sd-[A-Za-z0-9-]{8,60})$/u);
  if (request.method === 'DELETE' && closeMatch) {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
    const member = await readMember(request, env);
    if (!member?.id) return json({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, 401);
    if (!db) return json({ ok: false, error: 'NO_DB' }, 503);
    const result = await db.prepare(`UPDATE shop_demand_requests SET status='CLOSED',updated_at=?3 WHERE demand_id=?1 AND member_id=?2 AND status<>'CLOSED'`).bind(closeMatch[1], member.id, new Date().toISOString()).run();
    return json({ ok: true, closed: Number(result?.meta?.changes || 0) });
  }
  if (request.method === 'POST' && (url.pathname === '/api/shops/demand' || url.pathname === '/api/shops/demand/claim')) {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
    if (!db) return json({ ok: false, error: 'NO_DB' }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'BODY_INVALID' }, 400); }
    const member = await readMember(request, env);
    if (url.pathname === '/api/shops/demand/claim') {
      if (!member?.id) return json({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, 401);
      const ids = (Array.isArray(body?.demand_ids) ? body.demand_ids : []).map((value) => clean(value, 60)).filter((value) => /^sd-[A-Za-z0-9-]{8,60}$/u.test(value)).slice(0, 20);
      let claimed = 0;
      for (const id of ids) {
        const result = await db.prepare(`UPDATE shop_demand_requests SET member_id=?2,updated_at=?3 WHERE demand_id=?1 AND member_id=''`).bind(id, member.id, new Date().toISOString()).run();
        claimed += Number(result?.meta?.changes || 0);
      }
      return json({ ok: true, claimed });
    }
    const text = clean(body?.query, DEMAND_QUERY_MAX + 1);
    const problem = demandQueryProblem(text);
    if (problem) return json({ ok: false, error: problem }, 400);
    const visitor = await visitorHash(request, env);
    try {
      const recent = await db.prepare(`SELECT COUNT(*) AS c FROM shop_demand_requests WHERE visitor_hash=?1 AND created_at>=datetime('now','-1 day')`).bind(visitor).first();
      if (Number(recent?.c || 0) >= 20) return json({ ok: false, error: 'TOO_MANY_REQUESTS' }, 429);
    } catch {}
    let sellerKey = '';
    const slug = clean(body?.seller_slug, 40).toLowerCase();
    if (slug) sellerKey = String((await activeShops(env)).find((shop) => shop.slug === slug)?.seller_key || '');
    const state = ['NONE', 'NEAR', 'EXACT'].includes(String(body?.result_state || '')) ? String(body.result_state) : 'NONE';
    const demandId = await saveDemand(db, { text, memberId: member?.id || '', visitor, sellerKey, state, conditions: demandConditions(text) });
    await recordShopEvent(env, 'shop_demand_saved', state, { content: member?.id ? 'member' : 'guest' });
    return json({ ok: true, demand_id: demandId, member: Boolean(member?.id), conditions: conditionLabels(demandConditions(text)) });
  }
  return null;
}

// ---- Seller 向け（/api/seller/shop/demand …、Business のみ。seller-shop.mjs から委譲） ----
async function sellerTenants(db, sellerKey) {
  const shop = await db.prepare(`SELECT tenants FROM seller_shops WHERE seller_key=?1`).bind(sellerKey).first();
  const account = await db.prepare(`SELECT tenants FROM seller_billing_accounts WHERE seller_key=?1`).bind(sellerKey).first();
  const parse = (value) => { try { const list = JSON.parse(value || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };
  return [...new Set([...parse(shop?.tenants), ...parse(account?.tenants)].map((t) => clean(t, 32).toLowerCase()).filter(Boolean))].slice(0, 5);
}

async function ownProductsFor(env, tenants, text, conditions) {
  const exact = [];
  const near = [];
  for (const tenant of tenants) {
    const rows = await retrieveCandidates(env, tenant, text, conditions, 40);
    for (const row of rows) {
      if (Number(row.stock ?? 1) <= 0) continue;
      const verdict = judgeTitle(row.product_name, conditions);
      if (verdict.level === 'EXACT') exact.push(row); else if (verdict.level === 'NEAR') near.push(row);
    }
  }
  return { exact: exact.length, near: near.length };
}

// §5/§42: Seller に見せるのは 5 人以上集まった需要だけ（既存 Seller ページの基準と同じ）。検索文そのものは出さず、
// 正規化した条件（色・素材・サイズ・名詞）を表示する。5 人未満は件数だけ。
export const SELLER_DEMAND_MIN_PEOPLE = 5;
export async function sellerDemandOverview(env, sellerKey, { judgeLimit = 20, minPeople = Number(env?.SHOP_DEMAND_SELLER_MIN_PEOPLE) || SELLER_DEMAND_MIN_PEOPLE } = {}) {
  const db = env.PRODUCT_DB;
  const tenants = await sellerTenants(db, sellerKey);
  let groups = [];
  try {
    const rows = await db.prepare(`SELECT r.demand_key, MIN(r.query_text) AS query_text, MIN(r.conditions_json) AS conditions_json,
        COUNT(DISTINCT CASE WHEN r.member_id<>'' THEN r.member_id ELSE r.visitor_hash END) AS people,
        SUM(CASE WHEN r.status='OPEN' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN r.status='MATCHED' THEN 1 ELSE 0 END) AS matched_count,
        SUM(CASE WHEN r.result_state='NONE' THEN 1 ELSE 0 END) AS none_count,
        SUM(CASE WHEN r.result_state='NEAR' THEN 1 ELSE 0 END) AS near_only_count,
        MAX(r.created_at) AS last_at
      FROM shop_demand_requests r WHERE r.created_at>=datetime('now','-60 days') AND (r.seller_key='' OR r.seller_key=?1)
      GROUP BY r.demand_key ORDER BY people DESC, last_at DESC LIMIT 50`).bind(sellerKey).all();
    groups = rows.results || [];
  } catch { groups = []; }
  let searchStats = new Map();
  try {
    const rows = await db.prepare(`SELECT demand_key, COUNT(*) AS searches, SUM(CASE WHEN result_state='NONE' THEN 1 ELSE 0 END) AS zero_results,
        SUM(CASE WHEN result_state='NEAR' THEN 1 ELSE 0 END) AS near_only, COUNT(DISTINCT visitor_hash) AS visitors
      FROM shop_search_log WHERE created_at>=datetime('now','-30 days') GROUP BY demand_key`).all();
    searchStats = new Map((rows.results || []).map((row) => [row.demand_key, row]));
  } catch {}
  let offers = new Map();
  try {
    const rows = await db.prepare(`SELECT demand_key, judged_level, product_name, created_at FROM shop_demand_offers WHERE seller_key=?1 ORDER BY created_at DESC LIMIT 200`).bind(sellerKey).all();
    for (const row of rows.results || []) if (!offers.has(row.demand_key)) offers.set(row.demand_key, row);
  } catch {}
  const items = [];
  const belowThreshold = groups.filter((group) => Number(group.people || 0) < minPeople);
  const visibleGroups = groups.filter((group) => Number(group.people || 0) >= minPeople);
  for (const [index, group] of visibleGroups.entries()) {
    const stats = searchStats.get(group.demand_key) || {};
    let own = { exact: null, near: null };
    if (index < judgeLimit && tenants.length) {
      let conditions = demandConditions(group.query_text);
      own = await ownProductsFor(env, tenants, group.query_text, conditions);
    }
    const state = own.exact === null ? '未判定' : own.exact > 0 ? '商品あり' : own.near > 0 ? '近い商品あり' : '不足';
    const conditions = (() => { try { return JSON.parse(group.conditions_json || '[]'); } catch { return []; } })();
    items.push({
      demand_key: group.demand_key, query: conditions.length ? conditions.join('・') : '（条件なし）', conditions,
      people: Number(group.people || 0), open: Number(group.open_count || 0), matched: Number(group.matched_count || 0),
      saved_with_zero: Number(group.none_count || 0), saved_with_near_only: Number(group.near_only_count || 0),
      searches_30d: Number(stats.searches || 0), zero_results_30d: Number(stats.zero_results || 0), near_only_30d: Number(stats.near_only || 0),
      own_exact: own.exact, own_near: own.near, state, last_at: String(group.last_at || ''),
      offer: offers.has(group.demand_key) ? { level: offers.get(group.demand_key).judged_level, product_name: offers.get(group.demand_key).product_name } : null
    });
  }
  let totals = { searches: 0, zero_results: 0, near_only: 0 };
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS searches, SUM(CASE WHEN result_state='NONE' THEN 1 ELSE 0 END) AS zero_results, SUM(CASE WHEN result_state='NEAR' THEN 1 ELSE 0 END) AS near_only FROM shop_search_log WHERE created_at>=datetime('now','-30 days')`).first();
    totals = { searches: Number(row?.searches || 0), zero_results: Number(row?.zero_results || 0), near_only: Number(row?.near_only || 0) };
  } catch {}
  return { tenants, items, totals, min_people: minPeople, below_threshold: { groups: belowThreshold.length, people: belowThreshold.reduce((sum, group) => sum + Number(group.people || 0), 0) } };
}

// 会員本人の「探しているもの」（ショップに探してもらっている条件）。本人のものだけ返す。
export async function memberDemands(env, memberId) {
  if (!env?.PRODUCT_DB || !memberId) return [];
  try {
    const rows = await env.PRODUCT_DB.prepare(`SELECT demand_id,query_text,conditions_json,status,result_state,matched_shop_slug,matched_product_url,matched_level,created_at,matched_at
      FROM shop_demand_requests WHERE member_id=?1 ORDER BY created_at DESC LIMIT 50`).bind(memberId).all();
    return (rows.results || []).map((row) => ({
      demand_id: row.demand_id, query: String(row.query_text || ''), conditions: (() => { try { return JSON.parse(row.conditions_json || '[]'); } catch { return []; } })(),
      status: row.status, result_state: row.result_state, matched_shop_slug: row.matched_shop_slug || '', matched_product_url: row.matched_product_url || '', matched_level: row.matched_level || '',
      created_at: row.created_at, matched_at: row.matched_at || ''
    }));
  } catch { return []; }
}

// Seller が「この需要に商品を登録」: 自社 tenant の商品を ASIN か商品URL で指定 → HOSHILU が条件を再判定。
export async function registerDemandOffer(env, sellerKey, input = {}, { now = new Date().toISOString() } = {}) {
  const db = env.PRODUCT_DB;
  const key = demandKey(input.demand_key);
  if (!key) throw new Error('DEMAND_KEY_REQUIRED');
  const demandRow = await db.prepare(`SELECT MIN(query_text) AS query_text FROM shop_demand_requests WHERE demand_key=?1`).bind(key).first();
  const queryText = String(demandRow?.query_text || '');
  if (!queryText) throw new Error('DEMAND_NOT_FOUND');
  const tenants = await sellerTenants(db, sellerKey);
  if (!tenants.length) throw new Error('NO_TENANT');
  const asin = clean(input.asin, 20).toUpperCase();
  const productUrl = httpsUrl(input.product_url);
  if (!/^[A-Z0-9]{10}$/u.test(asin) && !productUrl) throw new Error('ASIN_OR_URL_REQUIRED');
  let product = null;
  for (const tenant of tenants) {
    const row = /^[A-Z0-9]{10}$/u.test(asin)
      ? await db.prepare(`SELECT product_name,image_url,amazon_jp_url AS url,asin FROM products WHERE tenant=?1 AND asin=?2 AND amazon_jp_url<>'' LIMIT 1`).bind(tenant, asin).first()
      : await db.prepare(`SELECT product_name,image_url,amazon_jp_url AS url,asin FROM products WHERE tenant=?1 AND amazon_jp_url=?2 LIMIT 1`).bind(tenant, productUrl).first();
    if (row) { product = row; break; }
    if (/^[A-Z0-9]{10}$/u.test(asin)) {
      const listing = await db.prepare(`SELECT product_name,image_url,product_url AS url,asin FROM sp_api_listings WHERE tenant=?1 AND asin=?2 AND product_url<>'' LIMIT 1`).bind(tenant, asin).first();
      if (listing) { product = listing; break; }
    }
  }
  if (!product) throw new Error('PRODUCT_NOT_IN_YOUR_SHOP');
  const conditions = demandConditions(queryText);
  const verdict = judgeTitle(product.product_name, conditions);
  const offerId = `so-${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO shop_demand_offers(offer_id,seller_key,demand_key,asin,product_url,product_name,image_url,judged_level,matched_json,unmatched_json,created_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
    .bind(offerId, sellerKey, key, clean(product.asin, 20), httpsUrl(product.url), clean(product.product_name, 160), httpsUrl(product.image_url), verdict.level, JSON.stringify(verdict.matched), JSON.stringify(verdict.unmatched), now).run();
  let notified = 0;
  if (verdict.level !== 'NONE') {
    const shop = (await activeShops(env)).find((item) => item.seller_key === sellerKey) || null;
    const card = { name: clean(product.product_name, 160), image: httpsUrl(product.image_url), url: httpsUrl(product.url), asin: clean(product.asin, 20), marketplace: 'AMAZON_JP', shop: publicShopRef(shop) };
    const open = await db.prepare(`SELECT * FROM shop_demand_requests WHERE demand_key=?1 AND status='OPEN' LIMIT 200`).bind(key).all();
    for (const demand of open.results || []) {
      if (verdict.level === 'NEAR' && demand.result_state !== 'NONE') continue;
      const result = await notifyDemandMatch(env, demand, { shop, card, level: verdict.level, now });
      await markMatched(db, demand, { shop, card, level: verdict.level, notificationId: result.notificationId, now });
      if (result.queued) notified += 1;
    }
  }
  return { offer_id: offerId, level: verdict.level, matched: verdict.matched, unmatched: verdict.unmatched, product: { name: clean(product.product_name, 160), asin: clean(product.asin, 20) }, notified };
}
