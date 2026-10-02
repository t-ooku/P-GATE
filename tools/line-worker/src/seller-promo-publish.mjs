// 2026-10-03 HOSHILU Seller「AI販促担当」承認と公開（指示書 §6-4）。
// - 承認できるのは検査に通った版（QA_PASSED）だけ。差し戻しは理由（事実が違う／言い回し／商品が違う／その他）を残す。
// - 公開先: WordPress（REST）→ 楽天GOLD（HTML の ZIP 納品）→ それ以外は原稿納品（DELIVERED）。
// - WordPress は自分が作った投稿（external_id）だけを更新する。公開後に GET で確かめ、取れなければ CONFIRMING。
// - SSRF 防止: https のみ・IP 直指定／localhost／プライベート名を拒否・リダイレクトを追わない。
//   検証用の *.trycloudflare.com は SELLER_PROMO_WP_HOST_ALLOWLIST に書いたときだけ通す。
// - 接続秘密は AES-GCM で保存し、平文をログ・レスポンスに出さない。
import { connectionAad, decryptPromoSecret, encryptPromoSecret } from './seller-promo-crypto.mjs';
import { activePromoProducts, dbFirst, dbRun, nowIso, parseJsonColumn, promoAudit, promoId, promoText, readPromoProfile, validSellerKey } from './seller-promo-store.mjs';

export const REJECT_REASONS = Object.freeze(['FACT_WRONG', 'WORDING', 'WRONG_PRODUCT', 'OTHER']);
const WP_TIMEOUT_MS = 15000;

const esc = (value) => String(value ?? '').replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- Markdown（最小限・安全側）→ HTML ------------------------------------------------
function inlineMd(text) {
  return esc(text).replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
}
export function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r/gu, '').split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inlineMd(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineMd(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-*・]\s+(.*)$/u);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/u);
    const heading = line.match(/^#{2,4}\s+(.*)$/u);
    if (!line) { flushPara(); flushList(); continue; }
    if (heading) { flushPara(); flushList(); out.push(`<h3>${inlineMd(heading[1])}</h3>`); continue; }
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list = list || { tag, items: [] };
      list.items.push((bullet || numbered)[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join('\n');
}

export function articleHtml(payload, products = []) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const links = (payload.product_refs || []).map((id) => byId.get(id)).filter((p) => p?.url)
    .map((p) => `<li><a href="${esc(p.url)}" rel="noopener">${esc(p.name)}</a></li>`);
  return [
    `<p>${inlineMd(payload.lead)}</p>`,
    ...(payload.sections || []).map((s) => `<h2>${esc(s.h2)}</h2>\n${markdownToHtml(s.body_md)}`),
    payload.faq?.length ? `<h2>よくある質問</h2>\n${payload.faq.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${inlineMd(f.a)}</p>`).join('\n')}` : '',
    links.length ? `<h2>この記事で紹介した商品</h2>\n<ul>${links.join('')}</ul>` : ''
  ].filter(Boolean).join('\n');
}

// ---- SSRF ガード ------------------------------------------------------------------
function hostAllowlist(env) {
  return String(env.SELLER_PROMO_WP_HOST_ALLOWLIST || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}
export function safeWordPressBase(value, env = {}) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('WP_URL_INVALID'); }
  if (url.protocol !== 'https:') throw new Error('WP_HTTPS_REQUIRED');
  if (url.username || url.password || url.port) throw new Error('WP_URL_INVALID');
  const host = url.hostname.toLowerCase();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) || host.includes(':') || host.startsWith('[')) throw new Error('WP_IP_LITERAL_FORBIDDEN');
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/u.test(host)) throw new Error('WP_PRIVATE_HOST_FORBIDDEN');
  // アカウント不要の一時トンネルは、検証の間だけ env の許可リストで通す。
  if (/(^|\.)trycloudflare\.com$/u.test(host) && !hostAllowlist(env).some((suffix) => host === suffix || host.endsWith(`.${suffix.replace(/^\*?\.?/u, '')}`))) {
    throw new Error('WP_HOST_NOT_ALLOWLISTED');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/u, '')}`;
}

async function wpFetch(env, url, init) {
  const fetchImpl = env.SELLER_PROMO_FETCH || fetch;
  const response = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(WP_TIMEOUT_MS) });
  if (response.status >= 300 && response.status < 400) throw new Error('WP_REDIRECT_REFUSED');
  return response;
}

// ---- 接続（管理者が店の許諾を得て登録）--------------------------------------------------
export async function saveWordPressConnection(env, input, now = new Date()) {
  const seller_key = String(input.seller_key || '');
  if (!validSellerKey(seller_key)) throw new Error('SELLER_KEY_INVALID');
  const site_url = safeWordPressBase(input.site_url, env);
  const username = promoText(input.username, 80);
  const password = String(input.app_password || '').replace(/\s+/gu, '');
  if (!username || password.length < 16 || password.length > 64) throw new Error('WP_CREDENTIALS_INVALID');
  const categoryIds = Array.isArray(input.scope?.category_ids) ? input.scope.category_ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 5) : [];
  const sealed = await encryptPromoSecret(env, password, connectionAad(seller_key, 'WORDPRESS'));
  await dbRun(env.PRODUCT_DB, `INSERT INTO seller_promo_connections(id,seller_key,kind,site_url,username,secret_enc,secret_iv,scope,status,created_at)
    VALUES(?1,?2,'WORDPRESS',?3,?4,?5,?6,?7,'ACTIVE',?8)
    ON CONFLICT(seller_key,kind) DO UPDATE SET site_url=excluded.site_url,username=excluded.username,secret_enc=excluded.secret_enc,
      secret_iv=excluded.secret_iv,scope=excluded.scope,status='ACTIVE',last_error=''`,
  promoId('spc'), seller_key, site_url, username, sealed.secret_enc, sealed.secret_iv, JSON.stringify({ category_ids: categoryIds }), nowIso(now));
  await promoAudit(env.PRODUCT_DB, { seller_key, actor: 'ADMIN', action: 'CONNECTION_SAVE', target_type: 'CONNECTION', target_id: 'WORDPRESS',
    detail: { site_host: new URL(site_url).hostname, category_ids: categoryIds } }, now);
  return { seller_key, kind: 'WORDPRESS', site_url, username, scope: { category_ids: categoryIds } };
}

async function readConnection(env, sellerKey) {
  const row = await dbFirst(env.PRODUCT_DB, `SELECT * FROM seller_promo_connections WHERE seller_key=?1 AND kind='WORDPRESS' AND status<>'DISABLED'`, sellerKey);
  if (!row) throw new Error('WP_CONNECTION_REQUIRED');
  const password = await decryptPromoSecret(env, row, connectionAad(sellerKey, 'WORDPRESS'));
  return { row, base: safeWordPressBase(row.site_url, env), auth: `Basic ${btoa(unescape(encodeURIComponent(`${row.username}:${password}`)))}`, scope: parseJsonColumn(row.scope, {}) };
}

export async function publishToWordPress(env, deliverable, products, now = new Date()) {
  const payload = parseJsonColumn(deliverable.payload, {});
  const conn = await readConnection(env, deliverable.seller_key);
  const body = {
    title: payload.title, slug: payload.slug, status: 'publish', excerpt: payload.meta_description,
    content: articleHtml(payload, products),
    ...(conn.scope.category_ids?.length ? { categories: conn.scope.category_ids } : {})
  };
  // 更新は自分の external_id の投稿だけ。無ければ新規作成。
  const target = /^\d{1,12}$/u.test(String(deliverable.external_id || '')) ? `${conn.base}/wp-json/wp/v2/posts/${deliverable.external_id}` : `${conn.base}/wp-json/wp/v2/posts`;
  const response = await wpFetch(env, target, { method: 'POST', headers: { authorization: conn.auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const created = await response.json().catch(() => ({}));
  if (!response.ok || !Number.isSafeInteger(Number(created?.id))) {
    const code = `WP_HTTP_${response.status}`;
    await dbRun(env.PRODUCT_DB, `UPDATE seller_promo_connections SET last_error=?1 WHERE id=?2`, code, conn.row.id);
    throw new Error(code);
  }
  const externalId = String(created.id);
  let status = 'CONFIRMING';
  let link = '';
  try {
    const check = await wpFetch(env, `${conn.base}/wp-json/wp/v2/posts/${externalId}`, { method: 'GET', headers: { authorization: conn.auth } });
    const confirmed = await check.json().catch(() => ({}));
    if (check.ok && confirmed?.status === 'publish' && String(confirmed?.id) === externalId) {
      status = 'PUBLISHED';
      link = String(confirmed.link || '');
    }
  } catch {
    status = 'CONFIRMING';
  }
  if (!link) link = String(created.link || '');
  try { if (new URL(link).protocol !== 'https:') link = ''; } catch { link = ''; }
  await dbRun(env.PRODUCT_DB, `UPDATE seller_promo_connections SET last_ok_at=?1,last_error='' WHERE id=?2`, nowIso(now), conn.row.id);
  return { status, external_id: externalId, published_url: link };
}

// ---- 楽天GOLD 納品（単体 HTML・CSS 内包・外部 JS なし・画像は絶対 URL）---------------------
export function rakutenGoldHtml(payload, products = [], brand = {}) {
  const color = /^#[0-9a-fA-F]{6}$/u.test(String(brand.color || '')) ? brand.color : '#1f6f5c';
  const byId = new Map(products.map((p) => [p.id, p]));
  const featured = (payload.product_refs || []).map((id) => byId.get(id)).filter(Boolean);
  const cards = featured.map((p) => `<div class="hp-item">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(payload.image_alt || p.name)}" loading="lazy">` : ''}<p>${p.url ? `<a href="${esc(p.url)}">${esc(p.name)}</a>` : esc(p.name)}</p></div>`).join('');
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(payload.title)}</title><meta name="description" content="${esc(payload.meta_description)}">
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;color:#222;line-height:1.8;background:#fff}
.hp-wrap{max-width:760px;margin:0 auto;padding:16px}
h1{font-size:1.5em;border-left:6px solid ${color};padding-left:10px}
h2{font-size:1.2em;margin-top:2em;border-bottom:2px solid ${color};padding-bottom:4px}
h3{font-size:1.05em}
.hp-items{display:flex;flex-wrap:wrap;gap:12px}.hp-item{flex:1 1 200px;border:1px solid #ddd;border-radius:8px;padding:8px}
.hp-item img{width:100%;height:auto;display:block}a{color:${color}}
</style></head><body><div class="hp-wrap">
<h1>${esc(payload.title)}</h1>
${articleHtml({ ...payload, product_refs: [] }, products)}
${cards ? `<h2>この記事で紹介した商品</h2><div class="hp-items">${cards}</div>` : ''}
</div></body></html>
`;
}

export const RAKUTEN_GOLD_README = [
  'HOSHILU 楽天GOLD 用 HTML',
  '',
  '- index.html は 1 ファイルで完結しています（文字コード UTF-8・CSS はファイル内・外部 JavaScript なし）。',
  '- 画像は https の絶対 URL で参照しています。画像を GOLD に置く場合は img の src を書き換えてください。',
  '- 置き場所・アップロード方法は、楽天の RMS マニュアル（楽天GOLD）の最新の案内に従ってください。',
  '- 公開したらページの URL を HOSHILU の担当へお知らせください（月次レポートに載せます）。',
  '',
  'ここには HOSHILU 側で作り方として確かめたことだけを書いています。楽天側のルールは RMS の案内を優先してください。'
].join('\r\n');

// ---- ZIP（無圧縮・STORE）----------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function buildStoredZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true); entry.setUint16(12, 0, true); entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const c of all) { out.set(c, at); at += c.length; }
  return out;
}

// ---- 状態遷移 ---------------------------------------------------------------------
export async function readDeliverable(db, id, sellerKey = null) {
  const row = await dbFirst(db, 'SELECT * FROM seller_promo_deliverables WHERE id=?1', id);
  if (!row || (sellerKey !== null && row.seller_key !== sellerKey)) throw new Error('DELIVERABLE_NOT_FOUND');
  return row;
}

async function setStatus(db, row, fromStatuses, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((key, i) => `${key}=?${i + 1}`).join(',');
  const placeholders = fromStatuses.map((_, i) => `?${keys.length + 2 + i}`).join(',');
  const result = await dbRun(db, `UPDATE seller_promo_deliverables SET ${sets} WHERE id=?${keys.length + 1} AND status IN (${placeholders})`,
    ...keys.map((k) => fields[k]), row.id, ...fromStatuses);
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('DELIVERABLE_STATE_CONFLICT');
}

export async function approveDeliverable(env, id, { actor, sellerKey = null, approvedBy, now = new Date() }) {
  const db = env.PRODUCT_DB;
  const row = await readDeliverable(db, id, sellerKey);
  if (row.status === 'APPROVED' || row.status === 'PUBLISHED' || row.status === 'DELIVERED') return row;
  if (row.status !== 'QA_PASSED') throw new Error('ONLY_QA_PASSED_CAN_BE_APPROVED');
  const at = nowIso(now);
  await setStatus(db, row, ['QA_PASSED'], { status: 'APPROVED', approved_by: promoText(approvedBy, 80), approved_at: at, updated_at: at });
  await promoAudit(db, { seller_key: row.seller_key, actor, action: 'DELIVERABLE_APPROVE', target_type: row.type, target_id: row.id,
    detail: { week_key: row.week_key, version: row.version } }, now);
  return publishDeliverable(env, id, { actor, now });
}

export async function rejectDeliverable(env, id, { actor, sellerKey = null, reason, note = '', now = new Date() }) {
  const db = env.PRODUCT_DB;
  const row = await readDeliverable(db, id, sellerKey);
  if (!REJECT_REASONS.includes(reason)) throw new Error('REJECT_REASON_REQUIRED');
  if (!['QA_PASSED', 'QA_FAILED', 'APPROVED'].includes(row.status)) throw new Error('DELIVERABLE_NOT_REJECTABLE');
  const at = nowIso(now);
  const text = `${reason}${note ? `: ${promoText(note, 300)}` : ''}`;
  await setStatus(db, row, ['QA_PASSED', 'QA_FAILED', 'APPROVED'], { status: 'REJECTED', rejected_reason: text, updated_at: at });
  await promoAudit(db, { seller_key: row.seller_key, actor, action: 'DELIVERABLE_REJECT', target_type: row.type, target_id: row.id, detail: { reason, note: promoText(note, 300) } }, now);
  return readDeliverable(db, id);
}

// APPROVED を公開先へ。WordPress は ARTICLE だけ。それ以外・GOLD・NONE は原稿納品（DELIVERED）。
// GOLD は ZIP のダウンロード時に DELIVERED にするので、ここでは APPROVED のまま待つ。
export async function publishDeliverable(env, id, { actor = 'SYSTEM', now = new Date() } = {}) {
  const db = env.PRODUCT_DB;
  const row = await readDeliverable(db, id);
  if (!['APPROVED', 'PUBLISH_FAILED', 'CONFIRMING'].includes(row.status)) return row;
  const profile = await readPromoProfile(db, row.seller_key);
  const at = nowIso(now);
  if (row.type === 'ARTICLE' && profile?.publish_target === 'WORDPRESS') {
    const products = await activePromoProducts(db, row.seller_key);
    try {
      const published = await publishToWordPress(env, row, products, now);
      await setStatus(db, row, [row.status], { status: published.status, published_target: 'WORDPRESS', published_url: published.published_url,
        published_at: at, external_id: published.external_id, updated_at: at });
      await promoAudit(db, { seller_key: row.seller_key, actor, action: 'DELIVERABLE_PUBLISH', target_type: row.type, target_id: row.id,
        detail: { target: 'WORDPRESS', status: published.status, external_id: published.external_id } }, now);
    } catch (error) {
      const code = promoText(error?.message, 60);
      await setStatus(db, row, [row.status], { status: 'PUBLISH_FAILED', published_target: 'WORDPRESS', updated_at: at });
      await promoAudit(db, { seller_key: row.seller_key, actor, action: 'DELIVERABLE_PUBLISH_FAILED', target_type: row.type, target_id: row.id, detail: { code } }, now);
    }
    return readDeliverable(db, id);
  }
  if (row.type === 'ARTICLE' && profile?.publish_target === 'RAKUTEN_GOLD_DELIVERY') return row;
  if (row.status === 'APPROVED') {
    await setStatus(db, row, ['APPROVED'], { status: 'DELIVERED', published_target: 'MANUSCRIPT', published_at: at, updated_at: at });
    await promoAudit(db, { seller_key: row.seller_key, actor, action: 'DELIVERABLE_DELIVER', target_type: row.type, target_id: row.id, detail: { target: 'MANUSCRIPT' } }, now);
  }
  return readDeliverable(db, id);
}

export async function autoApproveDeliverable(env, id, now = new Date()) {
  return approveDeliverable(env, id, { actor: 'SYSTEM', approvedBy: 'AUTO', now });
}

export async function rakutenGoldZip(env, id, { actor, sellerKey = null, now = new Date() }) {
  const db = env.PRODUCT_DB;
  const row = await readDeliverable(db, id, sellerKey);
  if (row.type !== 'ARTICLE') throw new Error('ARTICLE_ONLY');
  if (!['APPROVED', 'DELIVERED'].includes(row.status)) throw new Error('APPROVAL_REQUIRED');
  const profile = await readPromoProfile(db, row.seller_key);
  const products = await activePromoProducts(db, row.seller_key);
  const payload = parseJsonColumn(row.payload, {});
  const zip = buildStoredZip([
    { name: 'index.html', data: rakutenGoldHtml(payload, products, profile?.brand || {}) },
    { name: 'README.txt', data: RAKUTEN_GOLD_README }
  ]);
  if (row.status === 'APPROVED') {
    const at = nowIso(now);
    await setStatus(db, row, ['APPROVED'], { status: 'DELIVERED', published_target: 'RAKUTEN_GOLD_DELIVERY', published_at: at, updated_at: at });
    await promoAudit(db, { seller_key: row.seller_key, actor, action: 'DELIVERABLE_DELIVER', target_type: row.type, target_id: row.id, detail: { target: 'RAKUTEN_GOLD_DELIVERY' } }, now);
  }
  return { zip, filename: `hoshilu-${row.week_key}-${payload.slug || 'article'}.zip` };
}

// 「自動公開を許可」は店本人だけが切り替える（監査ログ必須）。
export async function setAutoPublish(env, sellerKey, enabled, now = new Date()) {
  const mode = enabled === true ? 'AUTO' : 'MANUAL';
  const result = await dbRun(env.PRODUCT_DB, `UPDATE seller_promo_profiles SET approval_mode=?1,updated_at=?2 WHERE seller_key=?3`, mode, nowIso(now), sellerKey);
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('PROFILE_NOT_FOUND');
  await promoAudit(env.PRODUCT_DB, { seller_key: sellerKey, actor: 'SELLER', action: 'APPROVAL_MODE_SET', target_type: 'PROFILE', target_id: sellerKey, detail: { mode } }, now);
  return mode;
}
