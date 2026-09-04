// 2026-09-04 総合実行指示書 §16–21 Experience Layer（経験財）MVP。
//
// 目的: HOSHILU 内で「探す」だけでなく「選ぶ」まで完結させる。
// - モールの口コミは転載しない。実利用者（会員ログイン済み）の構造化投稿だけ。
// - 星1つではなく、買う前に知りたい経験軸をカテゴリごとに動的に出す。
// - 表示は「自立性 89%」のように短時間で判断できる形。
// - 架空レビュー・AI生成レビューを実利用者レビューとして表示しない（投稿はログイン必須、
//   1人1商品1件、1日20件まで）。
// - 検索文・メール・電話番号は保存しない。product_key は商品名の正規化ハッシュ。

import { readMemberSession } from './member-auth.mjs';

const encoder = new TextEncoder();

export const EXPERIENCE_AXES = Object.freeze({
  BAG: [
    ['stand', '自立する'], ['light', '軽い'], ['capacity', '収納力'], ['laptop', 'PCが入る'],
    ['shoulder', '肩掛けしやすい'], ['scratch', '傷つきにくい'], ['photo', '写真との差が少ない']
  ],
  APPAREL: [
    ['size', 'サイズどおり'], ['fabric', '生地が良い'], ['opaque', '透けにくい'], ['comfort', '着心地'],
    ['color', '色が写真どおり'], ['photo', '写真との差が少ない']
  ],
  SHOES: [
    ['size', 'サイズどおり'], ['width', '幅にゆとり'], ['cushion', 'クッション'], ['fatigue', '疲れにくい'], ['light', '軽い']
  ],
  COSMETICS: [
    ['pigment', '発色'], ['lasting', '色持ち'], ['moist', '乾燥しにくい'], ['scent', '香りが良い'], ['skin', '肌に合う']
  ],
  APPLIANCE: [
    ['quiet', '静か'], ['usability', '操作しやすい'], ['care', '手入れが楽'], ['size', 'サイズ感が合う'], ['durable', '長持ち']
  ],
  GENERIC: [
    ['quality', '品質'], ['photo', '写真との差が少ない'], ['usability', '使いやすい'], ['durable', '長持ち'], ['value', 'コスパ']
  ]
});

const CATEGORY_RULES = [
  ['BAG', /(?:バッグ|bag|トート|tote|リュック|backpack|ショルダー|ポーチ|財布|wallet|キャリー|スーツケース)/iu],
  ['SHOES', /(?:靴|シューズ|shoes|sneaker|スニーカー|サンダル|ブーツ|パンプス|ローファー|boots|loafer)/iu],
  ['APPAREL', /(?:ワンピース|ブラウス|シャツ|パンツ|スカート|コート|ジャケット|ニット|パーカー|カットソー|Tシャツ|デニム|dress|blouse|shirt|pants|skirt|coat|jacket|knit|hoodie|tee|服|アパレル|下着|インナー|靴下|ソックス)/iu],
  ['COSMETICS', /(?:コスメ|化粧|リップ|ティント|美容液|ファンデ|マスカラ|アイシャドウ|チーク|香水|スキンケア|シャンプー|ヘアケア|ネイル|日焼け止め|クレンジング|洗顔|乳液|化粧水|lip|tint|serum|foundation|mascara|perfume|shampoo|skincare)/iu],
  ['APPLIANCE', /(?:家電|イヤホン|ヘッドホン|充電器|スピーカー|カメラ|ライト|照明|モニター|キーボード|マウス|タブレット|スマホ|掃除機|炊飯器|冷蔵庫|洗濯機|電子レンジ|エアコン|ドライヤー|プロジェクター|テレビ|扇風機|加湿器|earphone|headphone|charger|speaker|camera|vacuum|monitor|keyboard)/iu]
];

export function experienceCategoryFor(productName = '', query = '') {
  const text = `${String(productName || '')} ${String(query || '')}`.normalize('NFKC');
  for (const [code, pattern] of CATEGORY_RULES) if (pattern.test(text)) return code;
  return 'GENERIC';
}

export function normalizeProductName(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[【】\[\]（）()「」『』]/gu, ' ').replace(/[\s　]+/gu, ' ').trim().slice(0, 200);
}

export async function productKeyFor(productName) {
  const normalized = normalizeProductName(productName);
  if (!normalized) return '';
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`hoshilu-experience:${normalized}`)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function memberHash(env, memberId) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(env.LINK_SIGNING_SECRET || env.AUTH_SESSION_SECRET || 'hoshilu')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`experience-member:${memberId}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function sanitizeComment(value) {
  return String(value || '').normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, ' ')
    .replace(/(?<!\d)(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}(?!\d)/gu, ' ')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/\s+/gu, ' ').trim().slice(0, 200);
}

export function scoreToPercent(scores = []) {
  const valid = scores.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, n) => sum + (n - 1) / 4, 0) / valid.length * 100);
}

export function normalizeRatings(category, input = {}) {
  const axes = EXPERIENCE_AXES[category] || EXPERIENCE_AXES.GENERIC;
  const ratings = {};
  for (const [key] of axes) {
    const value = Number(input?.[key]);
    if (Number.isInteger(value) && value >= 1 && value <= 5) ratings[key] = value;
  }
  return ratings;
}

export async function experienceSummary(db, { productName, query = '' } = {}) {
  const category = experienceCategoryFor(productName, query);
  const axes = EXPERIENCE_AXES[category];
  const key = await productKeyFor(productName);
  const base = { name: String(productName || '').slice(0, 200), key, category, axes: axes.map(([k, label]) => ({ key: k, label, percent: null })), count: 0, would_buy_again_percent: null, comments: [] };
  if (!db || !key) return base;
  const rows = await db.prepare(`SELECT ratings,would_buy_again,comment,created_at FROM experience_reports
    WHERE product_key=?1 AND status='PUBLISHED' ORDER BY created_at DESC LIMIT 200`).bind(key).all();
  const reports = (rows.results || []).map((row) => ({ ...row, ratings: safeJson(row.ratings) }));
  if (!reports.length) return base;
  return {
    ...base,
    count: reports.length,
    axes: axes.map(([k, label]) => ({ key: k, label, percent: scoreToPercent(reports.map((r) => r.ratings[k]).filter((v) => v !== undefined)) })),
    would_buy_again_percent: Math.round(reports.filter((r) => Number(r.would_buy_again) === 1).length / reports.length * 100),
    comments: reports.filter((r) => r.comment).slice(0, 3).map((r) => ({ text: r.comment, at: String(r.created_at).slice(0, 10) }))
  };
}

function safeJson(value) { try { return JSON.parse(value || '{}') || {}; } catch { return {}; } }

async function recordExperienceEvent(env, eventType, locale = 'JA') {
  if (!env?.PRODUCT_DB) return;
  try {
    await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
      VALUES(?1,?2,?3,'worker','experience','','','',?4,'UNATTRIBUTED')`)
      .bind(crypto.randomUUID(), eventType, locale, new Date().toISOString()).run();
  } catch {}
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

export async function handleExperienceRoutes(request, env, { readMember = readMemberSession } = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/experience/')) return null;
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
  const db = env.PRODUCT_DB;
  let body = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: 'BODY_INVALID' }, 400); }

  if (url.pathname === '/api/experience/summaries') {
    const items = Array.isArray(body.items) ? body.items.slice(0, 12) : [];
    const query = String(body.query || '').slice(0, 200);
    const results = [];
    for (const item of items) {
      const name = String(item?.name || '').slice(0, 200);
      if (!name) continue;
      try { results.push(await experienceSummary(db, { productName: name, query })); }
      catch { results.push({ name, key: '', category: 'GENERIC', axes: [], count: 0, would_buy_again_percent: null, comments: [] }); }
    }
    if (results.some((r) => r.count > 0)) await recordExperienceEvent(env, 'experience_viewed', body.locale);
    return json({ ok: true, items: results });
  }

  if (url.pathname === '/api/experience/report') {
    if (!db) return json({ ok: false, error: 'NO_DB' }, 503);
    const member = await readMember(request, env);
    if (!member?.id) return json({ ok: false, error: 'LOGIN_REQUIRED' }, 401);
    const name = String(body.name || '').slice(0, 200);
    const key = await productKeyFor(name);
    if (!key) return json({ ok: false, error: 'PRODUCT_REQUIRED' }, 400);
    const category = experienceCategoryFor(name, String(body.query || ''));
    const ratings = normalizeRatings(category, body.ratings);
    if (Object.keys(ratings).length < 2) return json({ ok: false, error: 'RATINGS_REQUIRED' }, 400);
    const hash = await memberHash(env, member.id);
    const dayStart = `${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)}`;
    const todays = await db.prepare(`SELECT COUNT(*) AS c FROM experience_reports WHERE member_hash=?1 AND created_at>=?2`)
      .bind(hash, new Date(Date.parse(`${dayStart}T00:00:00+09:00`)).toISOString()).first();
    if (Number(todays?.c || 0) >= 20) return json({ ok: false, error: 'DAILY_LIMIT' }, 429);
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO experience_reports
      (report_id,product_key,product_name,category,member_hash,source,ratings,would_buy_again,comment,status,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,'MEMBER',?6,?7,?8,'PUBLISHED',?9,?9)
      ON CONFLICT(product_key,member_hash) DO UPDATE SET ratings=excluded.ratings,would_buy_again=excluded.would_buy_again,
        comment=excluded.comment,category=excluded.category,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(), key, name, category, hash, JSON.stringify(ratings),
        body.would_buy_again === true || body.would_buy_again === 1 ? 1 : 0, sanitizeComment(body.comment), now).run();
    await recordExperienceEvent(env, 'experience_posted', body.locale);
    return json({ ok: true, summary: await experienceSummary(db, { productName: name, query: String(body.query || '') }) });
  }
  return json({ ok: false, error: 'NOT_FOUND' }, 404);
}
