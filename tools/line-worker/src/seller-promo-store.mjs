// 2026-10-03 HOSHILU Seller「AI販促担当」(指示書 ai-promo-20261003-v2 §5)。
// 店プロファイル・商品の取り込み・疑問の取り込み・監査ログ。D1 の読み書きはここに寄せる。
// - 店の商品は「店データの転記のみ」。価格・寸法などを推測で埋めない。
// - 疑問は 300 字まで。FORM は PII パターンをマスクする。HOSHILU_DEMAND は 5 人以上・内部会員除外。
// - 検索文・検索単位 ID は保存しない（HOSHILU_DEMAND は正規化した条件ラベルだけを使う）。
import { searchingDemandOverview } from './searching-demand.mjs';

export const PROMO_PLANS = Object.freeze(['LISTING', 'LIGHT', 'STANDARD']);
export const PROMO_DELIVERY_PLANS = Object.freeze(['LIGHT', 'STANDARD']);
// 90 日間の対象カテゴリ（§1）。
export const PROMO_ALLOWED_CATEGORIES = Object.freeze(['生活雑貨', 'インテリア', 'ペット', '文具', 'アウトドア', 'バッグ', '靴']);
// プロファイルで拒否するカテゴリ（§1）。表記ゆれも拒否する。
const FORBIDDEN_CATEGORY = /化粧品|コスメ|スキンケア|健康食品|サプリ|食品|食料品|飲料|医療機器|医薬|医療/u;
export const QUESTION_SOURCES = Object.freeze(['FEEDBACK_API', 'STORE_PASTE', 'HOSHILU_DEMAND', 'SUGGEST', 'FORM']);
const PRODUCT_SOURCES = Object.freeze(['CSV', 'URL', 'SP_API']);
const MAX_PRODUCTS_PER_IMPORT = 500;
const MAX_QUESTIONS_PER_IMPORT = 200;

export const promoText = (value, max = 200) => String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);
export const nowIso = (now = new Date()) => now.toISOString();
export const promoId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/gu, '')}`;

export function promoEnabled(env = {}) {
  return String(env.SELLER_PROMO_ENABLED || '').toLowerCase() === 'true';
}
export function promoPlansEnabled(env = {}) {
  return String(env.SELLER_PROMO_PLANS_ENABLED || '').toLowerCase() === 'true';
}
export function pilotSellerKeys(env = {}) {
  return new Set(String(env.SELLER_PROMO_PILOT_SELLER_KEYS || '').split(',').map((v) => v.trim()).filter(Boolean));
}

export function parseJsonColumn(value, fallback) {
  try {
    const parsed = JSON.parse(String(value ?? ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// JST の日時要素。週次の区切りと月次の区切りはすべて JST で数える。
export function jstParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 9 * 3600 * 1000);
  return {
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes()
  };
}
// ISO 8601 週番号（JST）。例: 2026-W41。
export function promoWeekKey(date = new Date()) {
  const { year, month, day } = jstParts(date);
  const target = new Date(Date.UTC(year, month - 1, day));
  const isoDay = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - isoDay);
  const isoYear = target.getUTCFullYear();
  const week = Math.ceil(((target - Date.UTC(isoYear, 0, 1)) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
export function isPromoWeekKey(value) {
  return /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/u.test(String(value || ''));
}
export function promoMonthKey(date = new Date()) {
  const { year, month } = jstParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}
// JST の月の範囲を UTC ISO で返す（created_at の比較用）。
export function jstMonthRange(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1) - 9 * 3600 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 9 * 3600 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

export async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function dbAll(db, sql, ...args) {
  const result = await db.prepare(sql).bind(...args).all();
  return Array.isArray(result?.results) ? result.results : [];
}
export async function dbRun(db, sql, ...args) {
  return db.prepare(sql).bind(...args).run();
}
export async function dbFirst(db, sql, ...args) {
  return (await dbAll(db, sql, ...args))[0] || null;
}

// 承認・公開・接続変更・差し戻しは必ず 1 行残す（§5）。
export async function promoAudit(db, { seller_key, actor, action, target_type = '', target_id = '', detail = {} }, now = new Date()) {
  if (!['SYSTEM', 'SELLER', 'ADMIN'].includes(actor)) throw new Error('AUDIT_ACTOR_INVALID');
  await dbRun(db, `INSERT INTO seller_promo_audit(id,seller_key,actor,action,target_type,target_id,detail,created_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`, promoId('spa'), seller_key, actor, promoText(action, 60),
  promoText(target_type, 40), promoText(target_id, 80), JSON.stringify(detail).slice(0, 4000), nowIso(now));
}

export function validSellerKey(value) {
  return /^[A-Za-z0-9_:-]{3,80}$/u.test(String(value || ''));
}

function stringList(value, { max = 30, maxLength = 40 } = {}) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => promoText(v, maxLength)).filter(Boolean))].slice(0, max);
}

export function normalizePromoProfile(input = {}) {
  const seller_key = String(input.seller_key || '').trim();
  if (!validSellerKey(seller_key)) throw new Error('SELLER_KEY_INVALID');
  const plan = String(input.plan || 'LISTING').toUpperCase();
  if (!PROMO_PLANS.includes(plan)) throw new Error('PLAN_INVALID');
  const rawCategories = Array.isArray(input.categories) ? input.categories.map((v) => promoText(v, 40)) : [];
  if (rawCategories.some((category) => FORBIDDEN_CATEGORY.test(category))) throw new Error('CATEGORY_NOT_ALLOWED');
  const categories = stringList(rawCategories, { max: 7 });
  if (!categories.length) throw new Error('CATEGORIES_REQUIRED');
  if (categories.some((category) => !PROMO_ALLOWED_CATEGORIES.includes(category))) throw new Error('CATEGORY_NOT_ALLOWED');
  const publish_target = String(input.publish_target || 'NONE').toUpperCase();
  if (!['NONE', 'WORDPRESS', 'RAKUTEN_GOLD_DELIVERY'].includes(publish_target)) throw new Error('PUBLISH_TARGET_INVALID');
  // 自動公開は店本人だけが切り替える（§6-4）。管理者の登録では常に MANUAL から始める。
  const brandInput = input.brand && typeof input.brand === 'object' ? input.brand : {};
  const color = /^#[0-9a-fA-F]{6}$/u.test(String(brandInput.color || '')) ? String(brandInput.color) : '#1f6f5c';
  const logo_asset_id = /^[A-Za-z0-9_-]{1,80}$/u.test(String(brandInput.logo_asset_id || '')) ? String(brandInput.logo_asset_id) : '';
  const weekday = input.weekday === undefined ? 1 : Number(input.weekday);
  const hour_jst = input.hour_jst === undefined ? 6 : Number(input.hour_jst);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('WEEKDAY_INVALID');
  if (!Number.isInteger(hour_jst) || hour_jst < 0 || hour_jst > 23) throw new Error('HOUR_INVALID');
  const notify_email = String(input.notify_email || '').trim();
  if (notify_email && !/^[^\s@<>]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/u.test(notify_email)) throw new Error('EMAIL_INVALID');
  const status = String(input.status || 'ACTIVE').toUpperCase();
  if (!['ACTIVE', 'PAUSED', 'ENDED'].includes(status)) throw new Error('STATUS_INVALID');
  return {
    seller_key, plan, categories, publish_target, weekday, hour_jst, notify_email, status,
    display_name: promoText(input.display_name, 80),
    ng_words: stringList(input.ng_words, { max: 50, maxLength: 30 }),
    brand: { color, logo_asset_id },
    pilot_id: /^[A-Za-z0-9_-]{0,80}$/u.test(String(input.pilot_id || '')) ? String(input.pilot_id || '') : '',
    qa: input.qa === true ? 1 : 0
  };
}

export async function upsertPromoProfile(db, input, now = new Date()) {
  const profile = normalizePromoProfile(input);
  const at = nowIso(now);
  await dbRun(db, `INSERT INTO seller_promo_profiles(seller_key,display_name,plan,categories,ng_words,brand,publish_target,
      approval_mode,weekday,hour_jst,notify_email,pilot_id,qa,status,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,'MANUAL',?8,?9,?10,?11,?12,?13,?14,?14)
    ON CONFLICT(seller_key) DO UPDATE SET display_name=excluded.display_name,plan=excluded.plan,categories=excluded.categories,
      ng_words=excluded.ng_words,brand=excluded.brand,publish_target=excluded.publish_target,weekday=excluded.weekday,
      hour_jst=excluded.hour_jst,notify_email=excluded.notify_email,pilot_id=excluded.pilot_id,qa=excluded.qa,
      status=excluded.status,updated_at=excluded.updated_at`,
  profile.seller_key, profile.display_name, profile.plan, JSON.stringify(profile.categories), JSON.stringify(profile.ng_words),
  JSON.stringify(profile.brand), profile.publish_target, profile.weekday, profile.hour_jst, profile.notify_email,
  profile.pilot_id, profile.qa, profile.status, at);
  await promoAudit(db, { seller_key: profile.seller_key, actor: 'ADMIN', action: 'PROFILE_UPSERT', target_type: 'PROFILE',
    target_id: profile.seller_key, detail: { plan: profile.plan, publish_target: profile.publish_target, status: profile.status } }, now);
  return profile;
}

export function hydrateProfile(row) {
  if (!row) return null;
  return {
    ...row,
    categories: parseJsonColumn(row.categories, []),
    ng_words: parseJsonColumn(row.ng_words, []),
    brand: parseJsonColumn(row.brand, {}),
    qa: Number(row.qa) === 1
  };
}
export async function readPromoProfile(db, sellerKey) {
  return hydrateProfile(await dbFirst(db, 'SELECT * FROM seller_promo_profiles WHERE seller_key=?1', sellerKey));
}

// ---- 商品 CSV ----------------------------------------------------------------
// RFC 4180 の最小実装（引用符・改行入りセル・"" のエスケープ）。BOM は除く。
export function parseCsv(text) {
  const source = String(text || '').replace(/^﻿/u, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

// 楽天の標準列名を第一候補に、Amazon の在庫レポート列名・汎用名を順に見る（§12）。
const COLUMN_ALIASES = Object.freeze({
  external_id: ['商品管理番号（商品URL）', '商品管理番号(商品URL)', '商品管理番号', '商品番号', 'seller-sku', 'sku', 'asin1', 'asin', 'id'],
  name: ['商品名', 'item-name', 'item_name', 'name', 'title'],
  price_jpy: ['販売価格', '通常購入販売価格', '価格', 'price', 'price_jpy'],
  url: ['商品ページURL', '商品URL', 'url', 'product_url'],
  image_url: ['商品画像パス1', '商品画像URL', 'image_url', 'image', 'image-url']
});

export function mapCsvHeaders(headers, mapping = null) {
  const normalized = headers.map((h) => String(h || '').trim());
  const index = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const explicit = mapping && typeof mapping === 'object' ? String(mapping[field] || '') : '';
    const candidates = explicit ? [explicit] : aliases;
    const found = candidates.map((alias) => normalized.findIndex((h) => h.toLowerCase() === alias.toLowerCase())).find((i) => i >= 0);
    if (found !== undefined && found >= 0) index[field] = found;
  }
  return index;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function priceValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const digits = String(value).normalize('NFKC').replace(/[,円\s]/gu, '');
  if (!/^\d{1,8}$/u.test(digits)) return null;
  return Number(digits);
}

export function productsFromCsv(csvText, mapping = null) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error('CSV_EMPTY');
  const [headers, ...body] = rows;
  const index = mapCsvHeaders(headers, mapping);
  if (index.name === undefined) {
    const error = new Error('CSV_MAPPING_REQUIRED');
    error.headers = headers.map((h) => promoText(h, 60)).slice(0, 60);
    throw error;
  }
  const used = new Set(Object.values(index));
  return body.slice(0, MAX_PRODUCTS_PER_IMPORT).map((cells, rowIndex) => {
    const attrs = {};
    headers.forEach((header, i) => {
      if (used.has(i)) return;
      const key = promoText(header, 40);
      const value = promoText(cells[i], 200);
      if (key && value && Object.keys(attrs).length < 30) attrs[key] = value;
    });
    return {
      external_id: promoText(index.external_id === undefined ? '' : cells[index.external_id], 120) || `row-${rowIndex + 1}`,
      name: promoText(cells[index.name], 255),
      price_jpy: index.price_jpy === undefined ? null : priceValue(cells[index.price_jpy]),
      url: index.url === undefined ? '' : httpsUrl(cells[index.url]),
      image_url: index.image_url === undefined ? '' : httpsUrl(cells[index.image_url]),
      attrs
    };
  });
}

export function normalizeProductItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('PRODUCTS_REQUIRED');
  return items.slice(0, MAX_PRODUCTS_PER_IMPORT).map((item, i) => {
    const attrs = {};
    if (item?.attrs && typeof item.attrs === 'object') {
      for (const [key, value] of Object.entries(item.attrs).slice(0, 30)) {
        const k = promoText(key, 40);
        const v = promoText(value, 200);
        if (k && v) attrs[k] = v;
      }
    }
    return {
      external_id: promoText(item?.external_id, 120) || `item-${i + 1}`,
      name: promoText(item?.name, 255),
      price_jpy: priceValue(item?.price_jpy),
      url: httpsUrl(item?.url),
      image_url: httpsUrl(item?.image_url),
      attrs
    };
  }).filter((item) => item.name);
}

// SP-API で同期済みの出品（sp_api_listings、店本人の認可で取得したもの）から転記する。
// ASIN は AI に渡さない（生成させない約束のため。attrs にも入れない）。価格は JPY のときだけ。
export async function productsFromSpApi(db, tenant) {
  if (!/^[a-z0-9_-]{1,32}$/u.test(String(tenant || ''))) throw new Error('TENANT_INVALID');
  const rows = await dbAll(db, `SELECT seller_sku,product_name,product_type,condition_type,image_url,price,currency,product_url
    FROM sp_api_listings WHERE tenant=?1 AND missing_from_amazon=0 AND product_name<>'' ORDER BY seller_sku LIMIT ?2`, tenant, MAX_PRODUCTS_PER_IMPORT);
  if (!rows.length) throw new Error('SP_API_LISTINGS_EMPTY');
  return rows.map((row) => {
    const attrs = {};
    if (row.product_type) attrs['商品タイプ'] = promoText(row.product_type, 80);
    if (row.condition_type) attrs['状態'] = promoText(row.condition_type, 40);
    const price = String(row.currency || 'JPY').toUpperCase() === 'JPY' && Number.isFinite(Number(row.price)) && row.price !== null ? Math.round(Number(row.price)) : null;
    return {
      external_id: promoText(row.seller_sku, 120), name: promoText(row.product_name, 255), price_jpy: price,
      url: httpsUrl(row.product_url), image_url: httpsUrl(row.image_url), attrs
    };
  });
}

export async function importPromoProducts(db, sellerKey, source, items, now = new Date()) {
  if (!PRODUCT_SOURCES.includes(source)) throw new Error('SOURCE_INVALID');
  const at = nowIso(now);
  let imported = 0;
  let unchanged = 0;
  for (const item of items) {
    const hash = await sha256Hex(JSON.stringify([item.name, item.price_jpy, item.url, item.image_url, item.attrs]));
    const existing = await dbFirst(db, 'SELECT id,hash FROM seller_promo_products WHERE seller_key=?1 AND source=?2 AND external_id=?3',
      sellerKey, source, item.external_id);
    if (existing?.hash === hash) { unchanged += 1; continue; }
    await dbRun(db, `INSERT INTO seller_promo_products(id,seller_key,source,external_id,name,price_jpy,url,image_url,attrs,hash,imported_at,active)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1)
      ON CONFLICT(seller_key,source,external_id) DO UPDATE SET name=excluded.name,price_jpy=excluded.price_jpy,url=excluded.url,
        image_url=excluded.image_url,attrs=excluded.attrs,hash=excluded.hash,imported_at=excluded.imported_at,active=1`,
    existing?.id || promoId('spp'), sellerKey, source, item.external_id, item.name, item.price_jpy, item.url, item.image_url,
    JSON.stringify(item.attrs), hash, at);
    imported += 1;
  }
  await promoAudit(db, { seller_key: sellerKey, actor: 'ADMIN', action: 'PRODUCTS_IMPORT', target_type: 'PRODUCTS',
    detail: { source, imported, unchanged } }, now);
  return { imported, unchanged };
}

export function hydrateProduct(row) {
  return { ...row, attrs: parseJsonColumn(row.attrs, {}), price_jpy: row.price_jpy === null ? null : Number(row.price_jpy) };
}
export async function activePromoProducts(db, sellerKey) {
  return (await dbAll(db, 'SELECT * FROM seller_promo_products WHERE seller_key=?1 AND active=1 ORDER BY imported_at DESC LIMIT 500', sellerKey))
    .map(hydrateProduct);
}

// ---- 疑問 ----------------------------------------------------------------------
// 任意の声フォーム（FORM）は個人を特定しうる文字列を伏せてから保存する。
export function maskPii(value) {
  return String(value || '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, '［メール］')
    .replace(/(?:\+?81[-\s]?|0)\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/gu, '［電話］')
    .replace(/〒?\s?\d{3}-\d{4}/gu, '［郵便番号］')
    .replace(/https?:\/\/\S+/gu, '［URL］');
}

export function normalizeQuestionItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('QUESTIONS_REQUIRED');
  return items.slice(0, MAX_QUESTIONS_PER_IMPORT).map((item) => {
    const source = String(item?.source || '').toUpperCase();
    if (!QUESTION_SOURCES.includes(source)) throw new Error('QUESTION_SOURCE_INVALID');
    // FEEDBACK_API は集計要約のみ（§1）。レビュー原文を受け取らない約束を入力でも確認する。
    if (source === 'FEEDBACK_API' && item?.aggregate !== true) throw new Error('FEEDBACK_AGGREGATE_ONLY');
    // HOSHILU_DEMAND はサーバー側の集計（refreshHoshiluDemandQuestions）だけが作る。
    if (source === 'HOSHILU_DEMAND') throw new Error('HOSHILU_DEMAND_IS_SERVER_ONLY');
    let text = promoText(item?.text, 2000);
    if (source === 'FORM') text = maskPii(text);
    text = text.slice(0, 300);
    if (!text) throw new Error('QUESTION_TEXT_REQUIRED');
    const weight = Number(item?.weight ?? 1);
    return {
      source, text,
      product_ref: promoText(item?.product_ref, 120),
      weight: Number.isFinite(weight) ? Math.min(100, Math.max(0, weight)) : 1,
      period_from: promoText(item?.period_from, 10),
      period_to: promoText(item?.period_to, 10)
    };
  });
}

export async function addPromoQuestions(db, sellerKey, items, { actor = 'ADMIN', now = new Date() } = {}) {
  let added = 0;
  for (const item of items) {
    const textHash = (await sha256Hex(`${item.product_ref}\n${item.text}`)).slice(0, 32);
    const result = await dbRun(db, `INSERT INTO seller_promo_questions(id,seller_key,source,product_ref,text,text_hash,weight,period_from,period_to,created_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(seller_key,source,text_hash) DO NOTHING`,
    promoId('spq'), sellerKey, item.source, item.product_ref, item.text, textHash, item.weight, item.period_from, item.period_to, nowIso(now));
    added += Number(result?.meta?.changes || 0);
  }
  await promoAudit(db, { seller_key: sellerKey, actor, action: 'QUESTIONS_ADD', target_type: 'QUESTIONS', detail: { added, received: items.length } }, now);
  return { added, duplicate: items.length - added };
}

// HOSHILU の匿名需要（5 人以上・内部会員除外。searching-demand.mjs の規則）から、店の商品名と
// 条件ラベルが重なるものだけを疑問として足す。人数は重みに使い、文面には条件だけを書く。
export async function refreshHoshiluDemandQuestions(env, sellerKey, products, now = new Date()) {
  const overview = await searchingDemandOverview(env);
  if (!overview.measurable || !overview.items.length) return { added: 0, measurable: overview.measurable };
  const productText = products.map((p) => `${p.name} ${Object.values(p.attrs || {}).join(' ')}`).join(' ').toLowerCase();
  const items = [];
  for (const group of overview.items) {
    const hits = group.conditions.filter((label) => label && productText.includes(String(label).toLowerCase()));
    if (!hits.length) continue;
    items.push({
      source: 'HOSHILU_DEMAND', product_ref: '', period_from: '', period_to: '',
      text: `HOSHILU で「${group.conditions.join('・')}」の条件で探している人がいます`.slice(0, 300),
      weight: Math.min(100, Number(group.people) || 0)
    });
  }
  if (!items.length) return { added: 0, measurable: true };
  return { ...(await addPromoQuestions(env.PRODUCT_DB, sellerKey, items.slice(0, 20), { actor: 'SYSTEM', now })), measurable: true };
}

export async function recentPromoQuestions(db, sellerKey, now = new Date(), limit = 10) {
  const since = new Date(now.getTime() - 90 * 86400000).toISOString();
  return dbAll(db, `SELECT id,source,product_ref,text,weight FROM seller_promo_questions
    WHERE seller_key=?1 AND created_at>=?2 ORDER BY weight DESC, created_at DESC LIMIT ?3`, sellerKey, since, limit);
}
