// HOSHILU GAS→Web移行: gas/ContractPolicyEngine.gs の判定ロジックをWorker/D1へ移植。
// docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3の方針どおり、
// GAS側のClient_Contracts/Recommendation_Decisionsシートは正本のまま維持し、
// D1はGASからのpush(ContractPolicySyncEngine.gs)で埋まる高速判定用の索引として扱う。
// D1に未同期の契約は findContractInD1 が null を返すので、呼び出し側は
// callGas(env,'KNOWLEDGE',...) へフォールバックすること(index.mjsのD1優先/GASフォールバック
// パターンに倣う)。

const ACCOUNT_TYPES = ['SELLER', 'MANUFACTURER'];
const STATUSES = ['ACTIVE', 'PAUSED', 'ENDED'];
const EXCLUSIVITY_MODES = ['NONE', 'ANSWER', 'CATEGORY'];

// このリポジトリのWorker側モジュール(product-index.mjs, unmet-demand-routes.mjs
// 等)の慣例に合わせ、エラーメッセージ自体をコードにする(GAS側のUtility.createError
// のような日本語メッセージ+.codeの分離はしない)。detailに元のフィールド名を残す。
function fail(code, detail) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail || '';
  return error;
}

function required(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw fail('CONTRACT_FIELD_REQUIRED', field);
  return text;
}

function normalizeDate(value, field, allowBlank) {
  const text = String(value ?? '').trim();
  if (!text && allowBlank) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw fail('CONTRACT_DATE_INVALID', field);
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw fail('CONTRACT_DATE_INVALID', field);
  }
  return text;
}

// GASの生シート行(category_scope: カンマ区切り文字列)と、Worker側で既に
// 正規化済みの配列(categories)の両方を受け付ける。ContractPolicySyncEngine.gs
// はGASのnormalizeContract済みオブジェクト(categories配列)をpushする想定。
function parseCategoryScope(value) {
  const items = Array.isArray(value)
    ? value
    : String(value ?? '*').split(',');
  const categories = items.map((item) => String(item ?? '').trim().toUpperCase()).filter(Boolean);
  return categories.length ? categories : ['*'];
}

function booleanValue(value) {
  return value === true || value === 1 || String(value ?? '').toUpperCase() === 'TRUE';
}

export function normalizeContract(source = {}) {
  const accountType = required(source.account_type, 'Account_Type').toUpperCase();
  const status = required(source.status, 'Status').toUpperCase();
  const exclusivity = required(source.exclusivity_mode || 'NONE', 'Exclusivity_Mode').toUpperCase();
  if (!ACCOUNT_TYPES.includes(accountType)) {
    throw fail('CONTRACT_ACCOUNT_TYPE_INVALID', `未対応のAccount_Typeです: ${accountType}`);
  }
  if (!STATUSES.includes(status)) {
    throw fail('CONTRACT_STATUS_INVALID', `未対応のStatusです: ${status}`);
  }
  if (!EXCLUSIVITY_MODES.includes(exclusivity)) {
    throw fail('CONTRACT_EXCLUSIVITY_INVALID', `未対応のExclusivity_Modeです: ${exclusivity}`);
  }
  const startDate = normalizeDate(source.start_date, 'Start_Date', false);
  const endDate = normalizeDate(source.end_date, 'End_Date', true);
  if (endDate && endDate < startDate) {
    throw fail('CONTRACT_DATE_RANGE_INVALID', 'End_DateがStart_Dateより前です。');
  }
  return {
    contract_id: required(source.contract_id, 'Contract_ID'),
    tenant: required(source.tenant, 'Tenant').toLowerCase(),
    account_type: accountType,
    account_id: required(source.account_id, 'Account_ID'),
    status,
    start_date: startDate,
    end_date: endDate,
    categories: parseCategoryScope(source.categories ?? source.category_scope),
    competitor_group: String(source.competitor_group ?? '').trim().toUpperCase(),
    exclusivity_mode: exclusivity,
    competitor_acceptance: booleanValue(source.competitor_acceptance),
    benchmark_consent: booleanValue(source.benchmark_consent),
    updated_at: source.updated_at || new Date().toISOString()
  };
}

export function isActive(contract, dateKey) {
  if (!contract || contract.status !== 'ACTIVE') return false;
  return contract.start_date <= dateKey && (!contract.end_date || contract.end_date >= dateKey);
}

export function includesCategory(contract, category) {
  const normalized = String(category ?? '').trim().toUpperCase();
  return contract.categories.includes('*') || contract.categories.includes(normalized);
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// gas/ContractPolicyEngine.gs answerSignature() と同じ手順(正規化JSON→SHA-256)
// で計算するので、将来GAS/Worker双方の決定ログを突き合わせても一致する。
export async function answerSignature(answerPayload) {
  return sha256Hex(canonicalStringify(answerPayload || {}));
}

// gas/KnowledgeEngine.gs normalizeText() と同じ正規化(NFKC・空白畳み込み)。
export function normalizeQueryText(value) {
  let text = String(value ?? '').toLowerCase();
  if (text.normalize) text = text.normalize('NFKC');
  return text.replace(/[\s　]+/g, ' ').trim();
}

export async function knowledgeKeyForQuery(query) {
  return sha256Hex(normalizeQueryText(query));
}

// gas/KnowledgeEngine.gs answer() の dateJst 計算と同じ(JST日付キー)。
export function jstDateKey(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function allow(reason, disclosureRequired, signature) {
  return { allowed: true, reason, disclosure_required: Boolean(disclosureRequired), answer_signature: signature };
}

function block(reason, signature) {
  return { allowed: false, reason, disclosure_required: false, answer_signature: signature };
}

// conflictingDecisions は通常、呼び出し側(loadConflictingDecisions)で対象契約
//自身を除き、allowed=trueだった決定だけに絞り込み済みのD1行を渡す。ただし
// gas/ContractPolicyEngine.gs evaluate() は「targetContract.competitor_groupが
// 空、またはexistingContract.competitor_groupと不一致ならcontinue」を行ごとに
// 判定しているため、ここでも同じガードを行ごとに再確認する(呼び出し側の
// 事前絞り込みだけに依存しない)。
export function evaluateContractPolicy({ dateKey, category, signature, targetContract, conflictingDecisions = [] }) {
  const normalizedCategory = String(category ?? '').trim().toUpperCase();
  if (!isActive(targetContract, dateKey)) return block('TARGET_CONTRACT_INACTIVE', signature);
  if (!includesCategory(targetContract, normalizedCategory)) return block('CATEGORY_OUT_OF_SCOPE', signature);
  let disclosureRequired = false;
  for (const row of conflictingDecisions) {
    if (!targetContract.competitor_group || targetContract.competitor_group !== row.competitor_group) continue;
    if (!isActive({ status: row.status, start_date: row.start_date, end_date: row.end_date }, dateKey)) continue;
    const sameCategory = String(row.category || '').toUpperCase() === normalizedCategory;
    const sameAnswer = String(row.answer_signature || '') === String(signature);
    if (sameCategory && (targetContract.exclusivity_mode === 'CATEGORY' || row.exclusivity_mode === 'CATEGORY')) {
      return block('CATEGORY_EXCLUSIVITY_CONFLICT', signature);
    }
    if (sameAnswer && (targetContract.exclusivity_mode === 'ANSWER' || row.exclusivity_mode === 'ANSWER')) {
      return block('ANSWER_EXCLUSIVITY_CONFLICT', signature);
    }
    if (sameAnswer) {
      if (!targetContract.competitor_acceptance || !row.competitor_acceptance) {
        return block('COMPETITOR_ACCEPTANCE_REQUIRED', signature);
      }
      disclosureRequired = true;
    }
  }
  return allow(disclosureRequired ? 'ALLOWED_WITH_COMPETITOR_DISCLOSURE' : 'ALLOWED', disclosureRequired, signature);
}

function rowToContract(row) {
  if (!row) return null;
  let categories;
  try {
    categories = JSON.parse(row.category_scope);
  } catch {
    categories = ['*'];
  }
  return {
    contract_id: row.contract_id,
    tenant: row.tenant,
    account_type: row.account_type,
    account_id: row.account_id,
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date || '',
    categories: Array.isArray(categories) && categories.length ? categories : ['*'],
    competitor_group: row.competitor_group || '',
    exclusivity_mode: row.exclusivity_mode,
    competitor_acceptance: Boolean(row.competitor_acceptance),
    benchmark_consent: Boolean(row.benchmark_consent),
    updated_at: row.updated_at
  };
}

export async function findContractInD1(env, contractId) {
  if (!env.PRODUCT_DB) return null;
  const row = await env.PRODUCT_DB.prepare(
    'SELECT * FROM contracts WHERE contract_id = ?1'
  ).bind(String(contractId || '')).first();
  return rowToContract(row);
}

// gas/ContractPolicyEngine.gs loadContracts() のD1版。gas/BenchmarkEngine.gsの
// eligibleAccounts()のように全契約の同意状態を横断的に見る処理で使う。
export async function loadAllContractsFromD1(env) {
  if (!env.PRODUCT_DB) return [];
  const result = await env.PRODUCT_DB.prepare('SELECT * FROM contracts').all();
  return (result.results || []).map(rowToContract);
}

async function loadConflictingDecisions(env, targetContract) {
  if (!targetContract.competitor_group) return [];
  const result = await env.PRODUCT_DB.prepare(
    `SELECT d.answer_signature, d.category, c.competitor_group, c.exclusivity_mode,
            c.competitor_acceptance, c.status, c.start_date, c.end_date
     FROM contract_decisions d
     JOIN contracts c ON c.contract_id = d.contract_id
     WHERE c.competitor_group = ?1 AND d.contract_id <> ?2 AND d.allowed = 1`
  ).bind(targetContract.competitor_group, targetContract.contract_id).all();
  return (result.results || []).map((row) => ({
    ...row,
    competitor_acceptance: Boolean(row.competitor_acceptance)
  }));
}

// gas/ContractPolicyEngine.gs decide() のD1版。対象契約がD1に未同期の場合は
// CONTRACT_NOT_FOUND を投げるので、呼び出し側はGASフォールバックへ切り替えること。
export async function decideContractPolicy(env, request = {}) {
  if (!env.PRODUCT_DB) throw fail('CONTRACT_POLICY_STORE_NOT_CONFIGURED', 'D1が未設定です。');
  const contractId = required(request.contract_id, 'Contract_ID');
  const category = required(request.category, 'Category').toUpperCase();
  const dateKey = normalizeDate(request.date_jst, 'Date_JST', false);
  const knowledgeKey = required(request.knowledge_key, 'Knowledge_Key');
  const signature = request.answer_signature || await answerSignature(request.answer_payload);
  const target = await findContractInD1(env, contractId);
  if (!target) throw fail('CONTRACT_NOT_FOUND', `契約が見つかりません: ${contractId}`);
  const conflicting = await loadConflictingDecisions(env, target);
  const result = evaluateContractPolicy({
    dateKey, category, signature, targetContract: target, conflictingDecisions: conflicting
  });
  const decisionId = crypto.randomUUID();
  const decidedAt = new Date().toISOString();
  await env.PRODUCT_DB.prepare(
    `INSERT INTO contract_decisions
     (decision_id,decided_at,contract_id,tenant,account_type,account_id,knowledge_key,
      answer_signature,category,allowed,reason,disclosure_required)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
  ).bind(
    decisionId, decidedAt, target.contract_id, target.tenant, target.account_type, target.account_id,
    knowledgeKey, result.answer_signature, category, result.allowed ? 1 : 0, result.reason,
    result.disclosure_required ? 1 : 0
  ).run();
  return {
    decision_id: decisionId,
    allowed: result.allowed,
    reason: result.reason,
    disclosure_required: result.disclosure_required,
    answer_signature: result.answer_signature
  };
}
