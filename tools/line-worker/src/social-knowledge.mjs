// HOSHILU GAS→Web移行: gas/SocialKnowledgeEngine.gs をWorker/D1へ移植。
// SNSコメント・アンケート回答を、同意告知・匿名化・自動/人手審査を経て匿名
// 需要集計へ変換するロジックとデータ層をここに置く。人手審査(review())の
// 呼び出し口となる管理UI/権限設計は
// docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §4.6により未着手
// (ユーザーとUI/権限設計を合意してから実装する)。ingest/moderate/
// rebuildAggregatesはUI非依存のため先行して移植する。

const ALLOWED_SOURCES = new Set(['INSTAGRAM', 'TIKTOK', 'X', 'YOUTUBE', 'LINE', 'WEB', 'MANUAL']);
const ALLOWED_RESPONSE_TYPES = new Set(['COMMENT', 'POLL', 'FORM']);
const ALLOWED_CONSENT_BASES = new Set(['EXPLICIT', 'POST_DISCLOSURE']);
const AUTO_REJECT_CATEGORIES = new Set(['THREAT', 'HATE', 'SEXUAL_EXPLOITATION', 'PERSONAL_DATA', 'MALICIOUS_SPAM']);
const FLAG_CATEGORIES = new Set(['HARASSMENT', 'SEXUAL', 'PROFANITY', 'SELF_HARM', 'OFF_TOPIC', 'COMMERCIAL_SPAM']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function required(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw fail(code);
  return text;
}

function allowedValue(value, values, code) {
  const normalized = required(value, code).toUpperCase();
  if (!values.has(normalized)) throw fail(code);
  return normalized;
}

export function normalizeText(value) {
  let text = String(value == null ? '' : value);
  if (text.normalize) text = text.normalize('NFKC');
  return text.replace(/[\s　]+/g, ' ').trim();
}

// gas/SocialKnowledgeEngine.gs redactPersonalData() の忠実な移植。
export function redactPersonalData(value) {
  const text = normalizeText(value);
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/(^|\s)@[A-Z0-9_.]+/gi, '$1[HANDLE]')
    .replace(/(?:\+?81[-\s]?)?(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})/g, '[PHONE]')
    .slice(0, 1000);
}

// gas/SocialKnowledgeEngine.gs extractHashtags() の忠実な移植。
export function extractHashtags(value) {
  const text = normalizeText(value);
  const matches = text.match(/[#＃][\p{L}\p{N}_ー-]{1,50}/gu) || [];
  const seen = new Set();
  return matches.map((tag) => tag.replace(/^[#＃]/, '').toLowerCase()).filter((tag) => {
    if (!tag || seen.has(tag)) return false;
    seen.add(tag);
    return true;
  }).slice(0, 20);
}

// gas/SocialKnowledgeEngine.gs moderateContent() の忠実な移植。正当な批判や
// 商品への不満は除外せず、高危険度のみ自動除外し、曖昧な内容は人手確認へ回す。
export function moderateContent(text, aiModeration) {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();
  const categories = [];
  const reasons = [];
  const highRiskPatterns = [
    { category: 'THREAT', pattern: /(?:殺す|死ね|消えろ|危害|kill\s+you|i(?:'|’)ll\s+kill)/i },
    { category: 'PERSONAL_DATA', pattern: /\[(?:EMAIL|PHONE)\]/i },
    { category: 'MALICIOUS_SPAM', pattern: /(?:今すぐ稼げる|必ず儲かる|送金して|口座番号|暗号資産を送|guaranteed\s+profit|send\s+(?:money|crypto))/i }
  ];
  const reviewPatterns = [
    { category: 'HARASSMENT', pattern: /(?:バカ|馬鹿|アホ|無能|きもい|クズ|idiot|stupid|moron)/i },
    { category: 'PROFANITY', pattern: /(?:くそ|クソ|fuck|shit)/i },
    { category: 'OFF_TOPIC', pattern: /(?:フォローして|相互フォロー|follow\s+me|dm\s+me)/i },
    { category: 'COMMERCIAL_SPAM', pattern: /(?:副業紹介|無料プレゼント|限定オファー|promo\s+code|buy\s+followers)/i }
  ];

  for (const rule of [...highRiskPatterns, ...reviewPatterns]) {
    if (rule.pattern.test(lower) && !categories.includes(rule.category)) {
      categories.push(rule.category);
      reasons.push(`RULE:${rule.category}`);
    }
  }

  const ai = aiModeration || {};
  const aiCategories = ai.categories || [];
  const aiConfidence = Number(ai.confidence || 0);
  for (const raw of aiCategories) {
    const aiCategory = String(raw || '').toUpperCase();
    if (aiCategory && !categories.includes(aiCategory)) categories.push(aiCategory);
  }
  if (aiCategories.length) {
    reasons.push(`AI:${categories.join(',')}:${aiConfidence.toFixed(2)}`);
  }

  const autoReject = categories.some((category) => AUTO_REJECT_CATEGORIES.has(category))
    && (!aiCategories.length || aiConfidence >= 0.85 || reasons.some((reason) => reason.startsWith('RULE:')));
  const flagged = categories.some((category) => FLAG_CATEGORIES.has(category))
    || (aiCategories.length > 0 && aiConfidence >= 0.5);

  return {
    status: autoReject ? 'AUTO_REJECTED' : (flagged ? 'REVIEW_FLAGGED' : 'REVIEW'),
    categories,
    reason: reasons.join('|').slice(0, 500)
  };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function findDuplicate(env, duplicateHash) {
  const row = await env.PRODUCT_DB.prepare(
    'SELECT response_id FROM social_knowledge_inbox WHERE duplicate_hash = ?1'
  ).bind(duplicateHash).first();
  return row ? String(row.response_id) : '';
}

// gas/SocialKnowledgeEngine.gs ingest() のD1版。
export async function ingest(env, request = {}) {
  if (!env.PRODUCT_DB) throw fail('SOCIAL_STORE_NOT_CONFIGURED');
  const source = allowedValue(request.source, ALLOWED_SOURCES, 'SOCIAL_SOURCE_INVALID');
  const responseType = allowedValue(request.response_type, ALLOWED_RESPONSE_TYPES, 'SOCIAL_RESPONSE_TYPE_INVALID');
  const consentBasis = allowedValue(request.consent_basis, ALLOWED_CONSENT_BASES, 'SOCIAL_CONSENT_REQUIRED');
  const disclosureVersion = required(request.disclosure_version, 'SOCIAL_DISCLOSURE_REQUIRED');
  const postId = required(request.post_id, 'SOCIAL_POST_ID_REQUIRED');
  const platformResponseId = required(request.platform_response_id, 'SOCIAL_RESPONSE_ID_REQUIRED');
  const redactedText = redactPersonalData(request.response_text);
  const pollOption = normalizeText(request.poll_option).slice(0, 200);
  if (!redactedText && !pollOption) throw fail('SOCIAL_RESPONSE_EMPTY');
  const authorHash = request.author_platform_id
    ? await sha256Hex(`${source}:${String(request.author_platform_id)}`) : '';
  const duplicateHash = await sha256Hex(`${source}:${postId}:${platformResponseId}`);
  const existingId = await findDuplicate(env, duplicateHash);
  if (existingId) return { status: 'DUPLICATE', response_id: existingId };

  const responseId = crypto.randomUUID();
  const collectedAt = new Date().toISOString();
  const moderation = moderateContent(redactedText || pollOption, request.ai_moderation);
  await env.PRODUCT_DB.prepare(
    `INSERT INTO social_knowledge_inbox (
      response_id,collected_at,source,post_id,campaign_id,response_type,response_text_redacted,
      poll_option,language,consent_basis,disclosure_version,author_hash,duplicate_hash,
      suggested_category,suggested_need_key,approved_category,approved_need_key,review_status,
      reviewed_at,reviewer,exclusion_reason
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)`
  ).bind(
    responseId, collectedAt, source, postId, String(request.campaign_id ?? '').trim(), responseType,
    redactedText, pollOption, String(request.language ?? 'JA').trim().toUpperCase() || 'JA',
    consentBasis, disclosureVersion, authorHash, duplicateHash,
    String(request.suggested_category ?? '').trim().toUpperCase(),
    String(request.suggested_need_key ?? '').trim().toLowerCase(),
    '', '', moderation.status, '', moderation.status === 'AUTO_REJECTED' ? 'AUTO_MODERATION' : '', moderation.reason
  ).run();
  return { status: moderation.status, response_id: responseId, moderation_categories: moderation.categories };
}

// gas/SocialKnowledgeEngine.gs ingestMany() の忠実な移植: 1件の失敗が
// バッチ全体を止めないよう、個別にcatchしてERROR結果を積む。
export async function ingestMany(env, requests = []) {
  const results = [];
  for (const request of requests) {
    try {
      results.push(await ingest(env, request));
    } catch (error) {
      results.push({ status: 'ERROR', error: { code: error.code || 'SOCIAL_INGEST_ERROR', message: error.message } });
    }
  }
  return results;
}

// gas/SocialKnowledgeEngine.gs review() のD1版。承認/却下の記録後、
// rebuildAggregates()を呼び直して匿名集計を最新化する(GASと同じ挙動)。
export async function review(env, responseId, decision = {}) {
  if (!env.PRODUCT_DB) throw fail('SOCIAL_STORE_NOT_CONFIGURED');
  const status = String(decision.status ?? '').trim().toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(status)) throw fail('SOCIAL_REVIEW_STATUS_INVALID');
  const existing = await env.PRODUCT_DB.prepare(
    'SELECT response_id FROM social_knowledge_inbox WHERE response_id = ?1'
  ).bind(String(responseId)).first();
  if (!existing) throw fail('SOCIAL_RESPONSE_NOT_FOUND');
  let approvedCategory = '';
  let approvedNeedKey = '';
  if (status === 'APPROVED') {
    approvedCategory = required(decision.category, 'SOCIAL_CATEGORY_REQUIRED').toUpperCase();
    approvedNeedKey = required(decision.need_key, 'SOCIAL_NEED_KEY_REQUIRED').toLowerCase();
  }
  await env.PRODUCT_DB.prepare(
    `UPDATE social_knowledge_inbox SET
      approved_category = ?2, approved_need_key = ?3, review_status = ?4,
      reviewed_at = ?5, reviewer = ?6, exclusion_reason = ?7
    WHERE response_id = ?1`
  ).bind(
    String(responseId), approvedCategory, approvedNeedKey, status, new Date().toISOString(),
    String(decision.reviewer ?? '').trim(), String(decision.exclusion_reason ?? '').trim()
  ).run();
  await rebuildAggregates(env);
  return { status, response_id: String(responseId) };
}

function uniqueCount(set) {
  return set.size;
}

// gas/SocialKnowledgeEngine.gs rebuildAggregates() のD1版。承認済み
// (Review_Status='APPROVED')行だけを対象に、GASと同じく全件再計算・総入れ替え
// を行う。
export async function rebuildAggregates(env) {
  if (!env.PRODUCT_DB) return { skipped: true };
  const result = await env.PRODUCT_DB.prepare(
    "SELECT * FROM social_knowledge_inbox WHERE review_status = 'APPROVED'"
  ).all();
  const rows = result.results || [];
  const groups = new Map();
  const hashtagGroups = new Map();
  for (const row of rows) {
    const needKey = String(row.approved_need_key || '');
    const category = String(row.approved_category || '');
    const language = String(row.language || 'JA');
    if (!needKey || !category) continue;
    const key = [needKey, category, language].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        need_key: needKey, category, language, count: 0,
        authors: new Set(), sources: new Set(), campaigns: new Set(),
        first: String(row.collected_at), last: String(row.collected_at)
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (row.author_hash) group.authors.add(String(row.author_hash));
    group.sources.add(String(row.source));
    if (row.campaign_id) group.campaigns.add(String(row.campaign_id));
    const collectedAt = String(row.collected_at);
    if (collectedAt < group.first) group.first = collectedAt;
    if (collectedAt > group.last) group.last = collectedAt;

    for (const tag of extractHashtags(row.response_text_redacted)) {
      if (!hashtagGroups.has(tag)) {
        hashtagGroups.set(tag, {
          count: 0, authors: new Set(), sources: new Set(), campaigns: new Set(),
          first: collectedAt, last: collectedAt
        });
      }
      const hashtag = hashtagGroups.get(tag);
      hashtag.count += 1;
      if (row.author_hash) hashtag.authors.add(String(row.author_hash));
      hashtag.sources.add(String(row.source));
      if (row.campaign_id) hashtag.campaigns.add(String(row.campaign_id));
      if (collectedAt < hashtag.first) hashtag.first = collectedAt;
      if (collectedAt > hashtag.last) hashtag.last = collectedAt;
    }
  }

  const updatedAt = new Date().toISOString();
  const aggregateRows = [...groups.keys()].sort().map((key) => {
    const group = groups.get(key);
    return {
      need_key: group.need_key, category: group.category, language: group.language,
      response_count: group.count, unique_authors: uniqueCount(group.authors),
      first_seen_at: group.first, last_seen_at: group.last,
      source_count: uniqueCount(group.sources), campaign_count: uniqueCount(group.campaigns),
      updated_at: updatedAt
    };
  });
  const hashtagRows = [...hashtagGroups.keys()].sort().map((tag) => {
    const item = hashtagGroups.get(tag);
    return {
      hashtag: tag, response_count: item.count, unique_authors: uniqueCount(item.authors),
      source_count: uniqueCount(item.sources), campaign_count: uniqueCount(item.campaigns),
      first_seen_at: item.first, last_seen_at: item.last, updated_at: updatedAt
    };
  });

  await env.PRODUCT_DB.batch([
    env.PRODUCT_DB.prepare('DELETE FROM social_knowledge_aggregates'),
    env.PRODUCT_DB.prepare('DELETE FROM social_hashtag_aggregates')
  ]);
  if (aggregateRows.length) {
    const sql = `INSERT INTO social_knowledge_aggregates (
      need_key,category,language,response_count,unique_authors,first_seen_at,last_seen_at,
      source_count,campaign_count,updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`;
    const prepared = env.PRODUCT_DB.prepare(sql);
    await env.PRODUCT_DB.batch(aggregateRows.map((row) => prepared.bind(
      row.need_key, row.category, row.language, row.response_count, row.unique_authors,
      row.first_seen_at, row.last_seen_at, row.source_count, row.campaign_count, row.updated_at
    )));
  }
  if (hashtagRows.length) {
    const sql = `INSERT INTO social_hashtag_aggregates (
      hashtag,response_count,unique_authors,source_count,campaign_count,first_seen_at,last_seen_at,updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`;
    const prepared = env.PRODUCT_DB.prepare(sql);
    await env.PRODUCT_DB.batch(hashtagRows.map((row) => prepared.bind(
      row.hashtag, row.response_count, row.unique_authors, row.source_count, row.campaign_count,
      row.first_seen_at, row.last_seen_at, row.updated_at
    )));
  }
  return { aggregate_count: aggregateRows.length, hashtag_count: hashtagRows.length };
}
