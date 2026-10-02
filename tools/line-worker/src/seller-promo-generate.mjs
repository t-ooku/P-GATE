// 2026-10-03 HOSHILU Seller「AI販促担当」週次パッケージの生成（指示書 §6-2）。
// - AI は既存と同じ Gemini（主）／OpenAI（予備・OPENAI_BACKUP_ENABLED=true のときだけ）を使う。
//   キー・エンドポイント・JSON 取り出しは ai-chat-intent.mjs と同じ形。モデルは SELLER_PROMO_MODEL。
// - 出力は JSON のみ。数値は店の商品データ（attrs・price_jpy）にある値だけ。検査で落ちたら理由を添えて
//   最大 2 回作り直す（2 回目以降は「数字を書かない」を強く指示）。
// - 1 回の呼び出しごとに seller_promo_usage へ原価を記録する（為替は SELLER_PROMO_JPY_PER_USD、既定 150）。
import { openAiBackupEnabled } from './ai-provider-availability.mjs';
import { checkPromoDeliverable, ARTICLE_MIN_CHARS, ARTICLE_MAX_CHARS } from './seller-promo-qa.mjs';
import { dbAll, dbRun, nowIso, promoId, promoText, recentPromoQuestions, activePromoProducts, parseJsonColumn, parseCsv } from './seller-promo-store.mjs';

const PROVIDER_TIMEOUT_MS = 60000;
const MAX_REGENERATIONS = 2;
// 既定単価（USD / 100 万トークン）。deep-canary.mjs の Gemini Flash 系と同じ値。env で上書きできる。
const DEFAULT_PRICES = Object.freeze({
  gemini: { input: 0.75, output: 3.75 },
  openai: { input: 1.25, output: 10 }
});

export function promoModel(env = {}) {
  return String(env.SELLER_PROMO_MODEL || env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash');
}

export function estimateCostJpy(env, provider, inputTokens, outputTokens) {
  const prefix = provider === 'openai' ? 'SELLER_PROMO_OPENAI' : 'SELLER_PROMO_GEMINI';
  const base = DEFAULT_PRICES[provider] || DEFAULT_PRICES.gemini;
  const inPrice = Number(env[`${prefix}_INPUT_USD_PER_M`]) > 0 ? Number(env[`${prefix}_INPUT_USD_PER_M`]) : base.input;
  const outPrice = Number(env[`${prefix}_OUTPUT_USD_PER_M`]) > 0 ? Number(env[`${prefix}_OUTPUT_USD_PER_M`]) : base.output;
  const jpyPerUsd = Number(env.SELLER_PROMO_JPY_PER_USD) > 0 ? Number(env.SELLER_PROMO_JPY_PER_USD) : 150;
  const usd = (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000;
  return Math.round(usd * jpyPerUsd * 100) / 100;
}

export function parseJsonText(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1] || raw;
  try {
    return JSON.parse(fenced.trim());
  } catch {
    const object = fenced.match(/\{[\s\S]*\}/u)?.[0];
    if (!object) return null;
    try { return JSON.parse(object); } catch { return null; }
  }
}

async function callGemini(env, prompt, fetchImpl) {
  const model = promoModel(env);
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, responseMimeType: 'application/json', maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'low' } }
    })
  });
  if (!response.ok) {
    const error = new Error('SELLER_PROMO_GEMINI_FAILED');
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  let text = '';
  for (const candidate of payload?.candidates || []) for (const part of candidate?.content?.parts || []) if (part?.text) text += part.text;
  const usage = payload?.usageMetadata || {};
  return {
    provider: 'gemini', model, json: parseJsonText(text),
    input_tokens: Math.max(0, Number(usage.promptTokenCount) || 0),
    output_tokens: Math.max(0, (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0))
  };
}

async function callOpenAi(env, prompt, fetchImpl) {
  const model = String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5');
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, input: prompt, max_output_tokens: 8192, text: { format: { type: 'json_object' } } })
  });
  if (!response.ok) {
    const error = new Error('SELLER_PROMO_OPENAI_FAILED');
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  let text = '';
  for (const item of payload?.output || []) {
    if (item?.type !== 'message') continue;
    for (const block of item.content || []) if (block?.type === 'output_text') text += block.text || '';
  }
  return {
    provider: 'openai', model, json: parseJsonText(text),
    input_tokens: Math.max(0, Number(payload?.usage?.input_tokens) || 0),
    output_tokens: Math.max(0, Number(payload?.usage?.output_tokens) || 0)
  };
}

export function promoAiConfigured(env = {}) {
  return String(env.GEMINI_API_KEY || '').length >= 20 || openAiBackupEnabled(env);
}

async function recordUsage(env, { sellerKey, jobId, result }, now = new Date()) {
  await dbRun(env.PRODUCT_DB, `INSERT INTO seller_promo_usage(id,seller_key,job_id,provider,model,input_tokens,output_tokens,images,cost_jpy_est,created_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,0,?8,?9)`, promoId('spu'), sellerKey, jobId, result.provider, promoText(result.model, 80),
  result.input_tokens, result.output_tokens, estimateCostJpy(env, result.provider, result.input_tokens, result.output_tokens), nowIso(now));
}

// Gemini を先に呼び、失敗したら（有効なときだけ）OpenAI。どちらも使えなければ投げる。
export async function callPromoModel(env, prompt, { fetchImpl = fetch, sellerKey, jobId } = {}) {
  const attempts = [];
  if (String(env.GEMINI_API_KEY || '').length >= 20) attempts.push(callGemini);
  if (openAiBackupEnabled(env)) attempts.push(callOpenAi);
  if (!attempts.length) throw new Error('SELLER_PROMO_AI_NOT_CONFIGURED');
  let lastError;
  for (const attempt of attempts) {
    try {
      const result = await attempt(env, prompt, fetchImpl);
      await recordUsage(env, { sellerKey, jobId, result });
      if (!result.json || typeof result.json !== 'object') throw new Error('SELLER_PROMO_AI_INVALID_JSON');
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// ---- 入力の組み立て ---------------------------------------------------------------
function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 重点商品（§12）: 直近に疑問が多い商品 → 未使用の商品 → 価格が中央値に近い商品 の順。
export function pickFocusProducts(products, questions, count = 3) {
  const questionCount = new Map();
  for (const q of questions) {
    const ref = String(q.product_ref || '');
    if (!ref) continue;
    for (const p of products) if (ref === p.id || ref === p.external_id) questionCount.set(p.id, (questionCount.get(p.id) || 0) + 1);
  }
  const mid = median(products.map((p) => p.price_jpy));
  return [...products].sort((a, b) => (questionCount.get(b.id) || 0) - (questionCount.get(a.id) || 0)
    || (a.last_featured_week ? 1 : 0) - (b.last_featured_week ? 1 : 0)
    || String(a.last_featured_week || '').localeCompare(String(b.last_featured_week || ''))
    || (mid === null ? 0 : Math.abs((a.price_jpy ?? Infinity) - mid) - Math.abs((b.price_jpy ?? Infinity) - mid))
    || String(a.id).localeCompare(String(b.id))).slice(0, Math.max(1, Math.min(count, products.length)));
}

function productBlock(products) {
  return JSON.stringify(products.map((p) => ({ id: p.id, name: p.name, price_jpy: p.price_jpy, url: p.url || null, attrs: p.attrs || {} })), null, 1);
}

const COMMON_RULES = [
  '日本語で、お店の担当者が書いたような、誇張のない落ち着いた文体で書く。',
  '数字（価格・寸法・容量・個数・日付・割合）は「商品データ」に書かれている値だけを使う。商品データに無い数字は一切書かない。迷ったら数字を書かない。',
  '在庫・配送日・URL・JAN・ASIN・型番を作らない。URL は書かない。',
  '「治る」「痩せる」「効く」「医師推奨」「返金保証」「今だけ」「限定」「最安」「No.1」「絶対」などの表現は使わない。効果・効能を断定しない。',
  '売上や順位を約束しない。他社を貶めない。',
  'お客様の疑問（下記）に、商品データから言えることだけで答える。データで答えられない疑問は「お店に確認してください」とする。',
  'JSON だけを返す。前置き・Markdown のコードブロックは不要。'
];

export function buildPromoPrompt(type, ctx, retryReasons = []) {
  const { profile, focus, questions, pastTitles } = ctx;
  const head = [
    `あなたは EC ショップ「${profile.display_name || 'このお店'}」の販促担当です。カテゴリ: ${(profile.categories || []).join('・')}。`,
    `店の NG 語（使わない）: ${(profile.ng_words || []).join('、') || 'なし'}`,
    '',
    '商品データ（id は出力でそのまま使う）:',
    productBlock(focus),
    '',
    'お客様の疑問（id は根拠として使う）:',
    JSON.stringify(questions.map((q) => ({ id: q.id, text: q.text, product_ref: q.product_ref || null })), null, 1),
    '',
    'ルール:',
    ...COMMON_RULES.map((rule) => `- ${rule}`)
  ];
  let body;
  if (type === 'ARTICLE') {
    body = [
      `- 記事は本文（lead・各 sections・faq の合計）で ${ARTICLE_MIN_CHARS}〜${ARTICLE_MAX_CHARS} 字。見出し（h2）は 3〜6 個。`,
      `- 過去の記事タイトルと重ならないテーマにする: ${JSON.stringify(pastTitles)}`,
      '- slug は英小文字・数字・ハイフンのみ。',
      '出力スキーマ:',
      '{"title":"","slug":"","lead":"","sections":[{"h2":"","body_md":""}],"faq":[{"q":"","a":""}],"product_refs":["商品id"],"image_alt":"","meta_description":"(120字以内)"}'
    ];
  } else if (type === 'SNS') {
    body = [
      '- SNS 原稿を 2 本。テーマを変える。各本に Instagram・X・Threads 向けの言い換えを付ける。',
      '- X は全角 140 字以内、Threads は 500 字以内、Instagram は 2,200 字以内（ハッシュタグは 5 個まで）。',
      '- image_brief は画像に載せる文字。headline は 14 字以内、sub は 24 字以内。product_id は商品データの id。',
      '出力スキーマ:',
      '{"posts":[{"theme":"","variants":{"instagram":"","x":"","threads":""},"image_brief":{"product_id":"","headline":"","sub":""}}]}'
    ];
  } else {
    body = [
      '- 商品ページの改善案を 1 件。お客様の疑問を根拠（evidence に疑問 id）にし、ページに足すべき説明を書く。',
      '- before は現在の説明の要約（商品データから）、after_md は追記する文章（Markdown）。where は PRODUCT_PAGE か FAQ。',
      '出力スキーマ:',
      '{"product_id":"","issue":"","evidence":["疑問id"],"before":"","after_md":"","where":"PRODUCT_PAGE"}'
    ];
  }
  const retry = retryReasons.length ? [
    '',
    `前回の出力は検査で不合格でした（理由: ${retryReasons.map((r) => `${r.code}${r.detail ? `:${r.detail}` : ''}`).join(' / ')}）。理由を直して作り直す。`,
    retryReasons.some((r) => r.code === 'NUMBER_NOT_IN_PRODUCT_DATA') ? '今回は数字を一切書かない（商品データの価格も書かない）。' : ''
  ] : [];
  return [...head, '', `作るもの: ${type}`, ...body, ...retry].join('\n');
}

async function otherSellerSimhashes(db, sellerKey) {
  const rows = await dbAll(db, `SELECT qa FROM seller_promo_deliverables WHERE type='ARTICLE' AND seller_key<>?1
    ORDER BY created_at DESC LIMIT 300`, sellerKey);
  return rows.map((row) => parseJsonColumn(row.qa, {})?.simhash).filter((v) => /^[0-9a-f]{16}$/u.test(String(v || '')));
}

async function pastArticleTitles(db, sellerKey) {
  const rows = await dbAll(db, `SELECT payload FROM seller_promo_deliverables WHERE seller_key=?1 AND type='ARTICLE'
    AND status NOT IN ('QA_FAILED','REJECTED') ORDER BY created_at DESC LIMIT 8`, sellerKey);
  return rows.map((row) => promoText(parseJsonColumn(row.payload, {})?.title, 120)).filter(Boolean);
}

export async function buildPromoContext(env, profile, now = new Date()) {
  const db = env.PRODUCT_DB;
  const products = await activePromoProducts(db, profile.seller_key);
  if (!products.length) throw new Error('SELLER_PROMO_NO_PRODUCTS');
  const questions = await recentPromoQuestions(db, profile.seller_key, now, 10);
  const focus = pickFocusProducts(products, questions, 3);
  return {
    profile, products, focus, questions,
    pastTitles: await pastArticleTitles(db, profile.seller_key),
    otherSimhashes: await otherSellerSimhashes(db, profile.seller_key)
  };
}

// 1 種類を作り、検査し、落ちたら理由付きで作り直す。返り値は検査結果の配列（すべての版）。
async function generateType(env, type, ctx, { fetchImpl, jobId }) {
  const versions = [];
  let reasons = [];
  for (let round = 0; round <= MAX_REGENERATIONS; round += 1) {
    const result = await callPromoModel(env, buildPromoPrompt(type, ctx, reasons), { fetchImpl, sellerKey: ctx.profile.seller_key, jobId });
    const candidates = type === 'SNS' ? (Array.isArray(result.json.posts) ? result.json.posts.slice(0, 2) : []) : [result.json];
    if (type === 'SNS' && candidates.length < 2) {
      reasons = [{ code: 'SCHEMA', detail: 'posts must contain 2 items' }];
      versions.push([{ passed: false, payload: result.json, qa: { passed: false, reasons, removed_urls: [], simhash: '', chars: 0 }, model: result.model }]);
      continue;
    }
    const checked = candidates.map((payload) => ({
      ...checkPromoDeliverable(type, payload, { products: ctx.focus, questions: ctx.questions, ngWords: ctx.profile.ng_words, otherSimhashes: ctx.otherSimhashes }),
      model: result.model
    }));
    versions.push(checked);
    if (checked.every((c) => c.passed)) break;
    reasons = checked.flatMap((c) => c.qa.reasons).slice(0, 10);
  }
  return versions;
}

// 週次パッケージ（ARTICLE 1・SNS 2・IMPROVEMENT 1）。IMAGE は R2 と画像ワークフローが揃うまで SKIPPED。
export async function generatePromoPackage(env, { profile, job, fetchImpl = fetch, now = new Date() }) {
  const ctx = await buildPromoContext(env, profile, now);
  const out = [];
  for (const type of ['ARTICLE', 'SNS', 'IMPROVEMENT']) {
    const versions = await generateType(env, type, ctx, { fetchImpl, jobId: job.id });
    out.push({ type, versions });
  }
  for (const product of ctx.focus) {
    await dbRun(env.PRODUCT_DB, 'UPDATE seller_promo_products SET last_featured_week=?1 WHERE id=?2 AND seller_key=?3', job.week_key, product.id, profile.seller_key);
  }
  return {
    results: out,
    image: env.SELLER_PROMO_ASSETS ? 'PENDING_WORKFLOW' : 'SKIPPED_NO_R2',
    focus_product_ids: ctx.focus.map((p) => p.id),
    question_ids: ctx.questions.map((q) => q.id)
  };
}

// 商品 CSV の見出し対応表の案（§12）。AI の答えは見出しに実在する名前だけ残す。取り込みには使わず、人の確認に回す。
export const CSV_MAPPING_FIELDS = Object.freeze(['external_id', 'name', 'price_jpy', 'url', 'image_url']);
export async function proposeCsvMapping(env, sellerKey, csvText, { fetchImpl = fetch } = {}) {
  const rows = parseCsv(csvText).slice(0, 4);
  const headers = (rows[0] || []).map((h) => promoText(h, 60)).slice(0, 60);
  const prompt = [
    'EC ショップの商品 CSV の見出しと先頭の数行です。各項目に当たる見出しを 1 つ選んでください。当たる見出しが無ければ空文字。',
    '項目: external_id（商品番号・SKU）, name（商品名）, price_jpy（販売価格・円）, url（商品ページURL）, image_url（商品画像URL）',
    `見出し: ${JSON.stringify(headers)}`,
    `先頭の行: ${JSON.stringify(rows.slice(1).map((r) => r.slice(0, 60).map((v) => promoText(v, 80))))}`,
    'JSON だけを返す: {"external_id":"","name":"","price_jpy":"","url":"","image_url":""}'
  ].join('\n');
  const result = await callPromoModel(env, prompt, { fetchImpl, sellerKey, jobId: 'csv-mapping' });
  const proposal = {};
  for (const field of CSV_MAPPING_FIELDS) {
    const value = String(result.json?.[field] || '');
    proposal[field] = headers.includes(value) ? value : '';
  }
  return proposal;
}
