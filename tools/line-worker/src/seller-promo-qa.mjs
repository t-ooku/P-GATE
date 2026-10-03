// 2026-10-03 HOSHILU Seller「AI販促担当」機械検査（指示書 §6-3）。
// 1. 数値照合（店の商品データにある値だけ） 2. 禁止表現 3. 同型検査（h2 列の simhash、店横断）
// 4. 文字数・外部 URL 除去 5. SNS 文字数 6. 理由を qa JSON に残す。
// AI に価格・寸法・在庫・URL・JAN/ASIN を作らせない、をここで機械的に担保する。
import { OUTREACH_FORBIDDEN_PHRASES } from './seller-outreach.mjs';

// 既存の営業文の禁止語（seller-outreach.mjs）に、販促原稿で特に避ける表現を足した共通リスト。
export const PROMO_FORBIDDEN_PHRASES = Object.freeze([
  ...OUTREACH_FORBIDDEN_PHRASES,
  '治る', '治ります', '完治', '痩せ', 'やせる', '効く', '効きます', '効果抜群', '医師推奨', '医師も推奨', '医師が推奨',
  '返金保証', '全額返金', '今だけ', '期間限定', '数量限定', '限定品', '限定販売', '残りわずか', '在庫限り', '最安',
  '日本一', '世界一', '世界初', 'No.1', 'ナンバーワン', '絶対', '保証します',
  // 2026-10-03 Cowork 依頼 §9-3: 原稿は店（当店）の語り。第三者・内部の言い回しを出さない。
  'お店に確認', 'お店にご確認', 'お店へ確認', 'お店へご確認', '直接お店', '店舗に確認', '店舗にご確認',
  '商品データ', 'データ上', 'データに記載', 'データにありません', 'データにはありません',
  // 2026-10-03 §9-5 の作り直しで残った言い回し
  '製品情報に記載', '情報に記載がございません', '記載がございません', '詳細は詳しくは'
]);

// 2026-10-03 Cowork 依頼 §9-1: 商品データに根拠の無い性質・評価の断定。過検出がありうるので不合格にはせず、
// 「要確認」の注記として店に見せ、自動公開からも外す。
// 活用（〜しやすく・〜にくい／にくく）でも拾えるよう語幹で持つ。
export const PROPERTY_CLAIM_WORDS = Object.freeze([
  '丈夫', '頑丈', '壊れにく', '割れにく', '傷つきにく', '錆びにく', 'さびにく', '長持ち', '耐久性',
  '軽い', '軽量', '軽く', '重さを感じ', 'お手入れしやす', 'お手入れもしやす', 'お手入れが簡単', 'お手入れも簡単', 'お手入れ簡単',
  '手入れしやす', '汚れにく', '汚れが落ちやす', '抗菌', '防カビ', '防臭', '消臭', '防水', '撥水', '耐水', '耐熱', '耐冷',
  '速乾', '乾きやす', '洗える', '洗濯できる', '洗濯可能', '丸洗い', '食洗機', '電子レンジ', '静音', '肌にやさし', '肌に優し',
  // 2026-10-03 §9-5 の作り直しで残った評価（素材や価格の良し悪しの断定）
  '扱いやす', 'お求めやす', '手頃な価格', 'お手頃'
]);

// 同じ漢字が 2 つ続く誤字の疑い（例「目目的」）。「々」で書く語は対象外。人の名前などの例外があるので注記だけにする。
export function doubledKanjiSuspects(strings = []) {
  const found = new Set();
  for (const raw of strings) for (const match of normalize(raw).matchAll(/(\p{Script=Han})\1/gu)) found.add(match[0]);
  return [...found];
}
const QUESTION_AFTER_CLAIM = /^(?:かどうか|か否か|かは|か、|か\?|か？|のか|ますか|ますか？)/u;
const TAX_LABEL = /税込|税抜|税別|内税|外税/u;

function productEvidenceText(products = []) {
  return normalize(products.flatMap((p) => [p.name, p.description, ...Object.keys(p.attrs || {}), ...Object.values(p.attrs || {})]).join('\n'));
}

// 生成後の整形（§9-2・§9-4）。数字そのものは変えない。
// - 商品データに税の表記が無ければ「（税込）」「税込」などを外す（断定しない）。
// - 4 桁以上の「〇〇円」は 3 桁区切りに揃える。
export function formatPromoText(text, { taxLabelKnown = false } = {}) {
  let out = String(text ?? '');
  const before = out;
  if (!taxLabelKnown) {
    out = out.replace(/\s*[（(]\s*(?:税込み?|税抜き?|税別|内税|外税)\s*[)）]/gu, '')
      .replace(/(\d[\d,]*\s*円)\s*(?:税込み?|税抜き?|税別)/gu, '$1')
      .replace(/(?:税込み?|税抜き?|税別)\s*(?=[¥￥]?\s*\d)/gu, '');
  }
  out = out.replace(/(?<![\d,.])(\d{4,})(?=\s*円)/gu, (digits) => Number(digits).toLocaleString('en-US'));
  return { text: out, changed: out !== before };
}

// 商品データに無い性質語を拾う（「洗えるかどうか」のような疑問の形は除く）。
export function unverifiedPropertyClaims(strings, products = []) {
  const evidence = productEvidenceText(products);
  const found = new Set();
  for (const raw of strings) {
    const text = normalize(raw);
    for (const word of PROPERTY_CLAIM_WORDS) {
      if (evidence.includes(normalize(word))) continue;
      let index = text.indexOf(word);
      while (index !== -1) {
        if (!QUESTION_AFTER_CLAIM.test(text.slice(index + word.length, index + word.length + 5))) { found.add(word); break; }
        index = text.indexOf(word, index + word.length);
      }
    }
  }
  return [...found];
}

export const ARTICLE_MIN_CHARS = 1500;
export const ARTICLE_MAX_CHARS = 2500;
export const SNS_LIMITS = Object.freeze({ x: 280, threads: 500, instagram: 2200 });
const COUNTER_AFTER_NUMBER = /^(?:つ|点|選|個の|ステップ|章|step)/iu;

const normalize = (value) => String(value ?? '').normalize('NFKC');

// 3 桁区切りのカンマを外して数字列を取り出す。
export function extractNumbers(value) {
  const text = normalize(value).replace(/(\d),(?=\d{3}(?:\D|$))/gu, '$1');
  const found = [];
  for (const match of text.matchAll(/\d+(?:\.\d+)?/gu)) {
    found.push({ value: match[0], after: text.slice(match.index + match[0].length, match.index + match[0].length + 4) });
  }
  return found;
}

export function allowedNumbersFromProducts(products = []) {
  const allowed = new Set();
  for (const product of products) {
    const sources = [product.name, product.price_jpy ?? '', ...Object.keys(product.attrs || {}), ...Object.values(product.attrs || {})];
    for (const source of sources) for (const { value } of extractNumbers(source)) allowed.add(String(Number(value)));
  }
  return allowed;
}

// X は全角（CJK 等）を 2 として数える（公式の weighted length に合わせた保守側）。
export function xWeightedLength(value) {
  let length = 0;
  for (const ch of String(value || '')) {
    const code = ch.codePointAt(0);
    length += (code <= 0x10ff || (code >= 0x2000 && code <= 0x200d) || (code >= 0x2010 && code <= 0x201f) || (code >= 0x2032 && code <= 0x2037)) ? 1 : 2;
  }
  return length;
}

// ---- simhash（64bit、文字 2-gram） ----------------------------------------------
function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}
export function simhash64(parts = []) {
  const weights = new Array(64).fill(0);
  for (const part of parts) {
    const text = normalize(part).replace(/\s+/gu, '').toLowerCase();
    const grams = text.length < 2 ? [text] : Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2));
    for (const gram of grams) {
      if (!gram) continue;
      const h = fnv1a64(gram);
      for (let bit = 0; bit < 64; bit += 1) weights[bit] += (h >> BigInt(bit)) & 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit += 1) if (weights[bit] > 0) out |= 1n << BigInt(bit);
  return out.toString(16).padStart(16, '0');
}
export function hammingDistance(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) { count += Number(x & 1n); x >>= 1n; }
  return count;
}

// ---- 文字列の取り出しと URL 除去 -------------------------------------------------
const URL_PATTERN = /https?:\/\/[^\s)\]」』>"']+/gu;
function stripUrls(text, allowedUrls, removed) {
  return String(text ?? '').replace(URL_PATTERN, (url) => {
    if (allowedUrls.has(url)) return url;
    removed.push(url.slice(0, 200));
    return '';
  });
}
// payload 内のすべての文字列に関数を当てる（構造は保つ）。
function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}
function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

export function articleChars(payload) {
  const parts = [payload.lead, ...(payload.sections || []).flatMap((s) => [s.h2, s.body_md]), ...(payload.faq || []).flatMap((f) => [f.q, f.a])];
  return parts.map((p) => normalize(p).replace(/\s+/gu, '')).join('').length;
}

function schemaReasons(type, payload, ctx) {
  const reasons = [];
  const productIds = new Set((ctx.products || []).map((p) => p.id));
  const questionIds = new Set((ctx.questions || []).map((q) => q.id));
  const isText = (v, max = 100000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (type === 'ARTICLE') {
    if (!isText(payload.title, 120)) reasons.push({ code: 'SCHEMA', detail: 'title' });
    if (!/^[a-z0-9-]{3,80}$/u.test(String(payload.slug || ''))) reasons.push({ code: 'SCHEMA', detail: 'slug' });
    if (!isText(payload.lead, 600)) reasons.push({ code: 'SCHEMA', detail: 'lead' });
    if (!Array.isArray(payload.sections) || payload.sections.length < 2 || payload.sections.length > 8
      || payload.sections.some((s) => !isText(s?.h2, 80) || !isText(s?.body_md, 3000))) reasons.push({ code: 'SCHEMA', detail: 'sections' });
    if (!Array.isArray(payload.faq) || payload.faq.some((f) => !isText(f?.q, 200) || !isText(f?.a, 600))) reasons.push({ code: 'SCHEMA', detail: 'faq' });
    if (!Array.isArray(payload.product_refs) || !payload.product_refs.length || payload.product_refs.some((id) => !productIds.has(id))) {
      reasons.push({ code: 'PRODUCT_REF_UNKNOWN', detail: 'product_refs' });
    }
    if (!isText(payload.meta_description, 160)) reasons.push({ code: 'SCHEMA', detail: 'meta_description' });
    if (typeof payload.image_alt !== 'string') reasons.push({ code: 'SCHEMA', detail: 'image_alt' });
  } else if (type === 'SNS') {
    if (!isText(payload.theme, 100)) reasons.push({ code: 'SCHEMA', detail: 'theme' });
    const variants = payload.variants || {};
    for (const key of ['instagram', 'x', 'threads']) if (!isText(variants[key])) reasons.push({ code: 'SCHEMA', detail: `variants.${key}` });
    if (isText(variants.x) && xWeightedLength(variants.x) > SNS_LIMITS.x) reasons.push({ code: 'SNS_LENGTH', detail: 'x' });
    if (isText(variants.threads) && [...variants.threads].length > SNS_LIMITS.threads) reasons.push({ code: 'SNS_LENGTH', detail: 'threads' });
    if (isText(variants.instagram) && [...variants.instagram].length > SNS_LIMITS.instagram) reasons.push({ code: 'SNS_LENGTH', detail: 'instagram' });
    const brief = payload.image_brief || {};
    if (!productIds.has(brief.product_id)) reasons.push({ code: 'PRODUCT_REF_UNKNOWN', detail: 'image_brief.product_id' });
    if (!isText(brief.headline) || [...brief.headline].length > 14) reasons.push({ code: 'IMAGE_TEXT_LENGTH', detail: 'headline' });
    if (typeof brief.sub !== 'string' || [...brief.sub].length > 24) reasons.push({ code: 'IMAGE_TEXT_LENGTH', detail: 'sub' });
  } else if (type === 'IMPROVEMENT') {
    if (!productIds.has(payload.product_id)) reasons.push({ code: 'PRODUCT_REF_UNKNOWN', detail: 'product_id' });
    for (const key of ['issue', 'before', 'after_md']) if (!isText(payload[key], 3000)) reasons.push({ code: 'SCHEMA', detail: key });
    if (!['PRODUCT_PAGE', 'FAQ'].includes(payload.where)) reasons.push({ code: 'SCHEMA', detail: 'where' });
    if (!Array.isArray(payload.evidence) || payload.evidence.some((id) => !questionIds.has(id))) reasons.push({ code: 'EVIDENCE_UNKNOWN', detail: 'evidence' });
  }
  return reasons;
}

// ctx: { products, questions, ngWords, otherSimhashes:[hex] }
export function checkPromoDeliverable(type, rawPayload, ctx = {}) {
  const reasons = [];
  const products = ctx.products || [];
  const allowedUrls = new Set(products.map((p) => p.url).filter(Boolean));
  const removedUrls = [];
  const formatted = new Set();
  const taxLabelKnown = TAX_LABEL.test(productEvidenceText(products));
  // 4. 外部 URL は落とす（店の商品 URL だけ残す）。落としたことは qa に残す。
  // §9-2・§9-4: 税の表記と価格の書き方を整える（直したことは qa.formatted に残す）。
  const payload = mapStrings(rawPayload && typeof rawPayload === 'object' ? rawPayload : {}, (s) => {
    const { text, changed } = formatPromoText(stripUrls(s, allowedUrls, removedUrls), { taxLabelKnown });
    if (changed) formatted.add('TAX_OR_PRICE_FORMAT');
    return text;
  });
  reasons.push(...schemaReasons(type, payload, ctx));
  // 本文の検査対象から、検査済みの ID 列（product_refs / evidence / product_id）は外す。
  const { product_refs: _r, evidence: _e, product_id: _p, image_brief, ...textual } = payload;
  const strings = collectStrings({ ...textual, image_brief: image_brief ? { headline: image_brief.headline, sub: image_brief.sub } : undefined });
  const joined = strings.join('\n');
  // 1. 数値照合
  const allowed = allowedNumbersFromProducts(products);
  const badNumbers = new Set();
  // 残した店の商品 URL（商品番号などの数字を含む）は数値照合の対象にしない。
  for (const text of strings.map((value) => value.replace(URL_PATTERN, ''))) {
    for (const { value, after } of extractNumbers(text)) {
      const number = String(Number(value));
      if (allowed.has(number)) continue;
      if (Number(value) >= 1 && Number(value) <= 10 && COUNTER_AFTER_NUMBER.test(after)) continue;
      badNumbers.add(value);
    }
  }
  if (badNumbers.size) reasons.push({ code: 'NUMBER_NOT_IN_PRODUCT_DATA', detail: [...badNumbers].slice(0, 10).join(',') });
  // 店の商品 URL（Amazon の /dp/<ASIN>/ など）は検査済みなので、URL を除いた本文だけで ASIN を探す。
  if (/\bB0[A-Z0-9]{8}\b/u.test(normalize(joined).replace(URL_PATTERN, ''))) reasons.push({ code: 'IDENTIFIER_GENERATED', detail: 'ASIN' });
  // 2. 禁止表現（共通リスト＋店の NG 語）
  const normalizedText = normalize(joined);
  const hits = [...PROMO_FORBIDDEN_PHRASES, ...(ctx.ngWords || [])].filter((phrase) => phrase && normalizedText.includes(normalize(phrase)));
  if (hits.length) reasons.push({ code: 'FORBIDDEN_EXPRESSION', detail: [...new Set(hits)].slice(0, 10).join(',') });
  let simhash = '';
  let chars = 0;
  if (type === 'ARTICLE') {
    chars = articleChars(payload);
    if (chars < ARTICLE_MIN_CHARS || chars > ARTICLE_MAX_CHARS) reasons.push({ code: 'ARTICLE_LENGTH', detail: String(chars) });
    // 3. 同型検査（店横断で h2 の並びがほぼ同じなら落とす）
    simhash = simhash64((payload.sections || []).map((s) => s?.h2 || ''));
    const near = (ctx.otherSimhashes || []).find((other) => /^[0-9a-f]{16}$/u.test(other) && hammingDistance(simhash, other) <= 3);
    if (near) reasons.push({ code: 'SAME_STRUCTURE_ACROSS_SELLERS', detail: near });
  }
  // §9-1: 根拠の無い性質語は「要確認」の注記（不合格にはしない）。
  const claims = unverifiedPropertyClaims(strings, products);
  const notes = claims.length ? [{ code: 'PROPERTY_CLAIM_UNVERIFIED', detail: claims.slice(0, 10).join(',') }] : [];
  const typos = doubledKanjiSuspects(strings);
  if (typos.length) notes.push({ code: 'TYPO_SUSPECT', detail: typos.slice(0, 10).join(',') });
  return {
    passed: reasons.length === 0,
    payload,
    qa: { checked_at: new Date().toISOString(), passed: reasons.length === 0, reasons, notes, formatted: [...formatted], removed_urls: removedUrls, simhash, chars }
  };
}
