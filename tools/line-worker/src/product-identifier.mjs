// HOSHILU GAS→Web移行: gas/ProductIdentifierEngine.gs をWorker/D1へ移植。
// 検証ロジック(normalizeIdentifier/hasValidCheckDigit/validateType)はUI非依存
// のため全面移植し、承認済みJAN/EAN/UPC↔ASINの索引をD1へミラーしてWorker側
// からの検索(lookupIdentifier)を可能にする。承認ワークフロー自体はSheetsの
// ままで、Identifier_Coverage/Identifier_Conflicts(社内運用レポート)は
// 対象外(docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3/§4.6)。

const TYPES = new Set(['JAN', 'EAN', 'UPC']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// gas/ProductIdentifierEngine.gs normalizeIdentifier() の忠実な移植。
export function normalizeIdentifier(value) {
  const text = String(value ?? '').trim().replace(/[\s-]/g, '');
  if (!/^\d{8,14}$/.test(text)) throw fail('IDENTIFIER_FORMAT_INVALID');
  return text;
}

// gas/ProductIdentifierEngine.gs hasValidCheckDigit() の忠実な移植
// (GS1標準のmod10チェックディジット: 末尾から3・1を交互に重み付け)。
export function hasValidCheckDigit(value) {
  let code;
  try {
    code = normalizeIdentifier(value);
  } catch {
    return false;
  }
  if (![8, 12, 13, 14].includes(code.length)) return false;
  let sum = 0;
  let position = 0;
  for (let i = code.length - 2; i >= 0; i -= 1) {
    sum += Number(code.charAt(i)) * (position % 2 === 0 ? 3 : 1);
    position += 1;
  }
  return (10 - (sum % 10)) % 10 === Number(code.charAt(code.length - 1));
}

// gas/ProductIdentifierEngine.gs validateType() の忠実な移植。
export function validateType(type, value) {
  const normalizedType = String(type ?? '').trim().toUpperCase();
  const code = normalizeIdentifier(value);
  if (!TYPES.has(normalizedType)) throw fail('IDENTIFIER_TYPE_INVALID');
  if (!hasValidCheckDigit(code)) throw fail('IDENTIFIER_CHECK_DIGIT_INVALID');
  if (normalizedType === 'JAN' && (code.length !== 13 || !/^(45|49)/.test(code))) throw fail('JAN_FORMAT_INVALID');
  if (normalizedType === 'UPC' && code.length !== 12) throw fail('UPC_FORMAT_INVALID');
  if (normalizedType === 'EAN' && ![8, 13, 14].includes(code.length)) throw fail('EAN_FORMAT_INVALID');
  return code;
}

// gas/ProductIdentifierEngine.gs buildIndex() の忠実な移植: tenant|value単位で
// 紐付くASIN一覧を作る(1つのコードに複数ASINが付くと衝突=findConflicts対象)。
export function buildIndex(mappings) {
  const index = new Map();
  for (const item of mappings) {
    const key = `${item.tenant}|${item.value}`;
    if (!index.has(key)) index.set(key, []);
    const asins = index.get(key);
    if (!asins.includes(item.asin)) asins.push(item.asin);
  }
  return index;
}

// gas/ProductIdentifierEngine.gs findConflicts() の忠実な移植。
export function findConflicts(mappings) {
  const index = buildIndex(mappings);
  return [...index.keys()].sort()
    .filter((key) => index.get(key).length > 1)
    .map((key) => {
      const separator = key.indexOf('|');
      return {
        tenant: key.slice(0, separator), identifier: key.slice(separator + 1),
        asins: [...index.get(key)].sort()
      };
    });
}

// gas/ProductIdentifierEngine.gs lookup() の忠実な移植(records/mappingsは
// 呼び出し側が用意した配列を受け取る、純粋関数版)。
export function lookup(records, mappings, tenant, value) {
  const code = normalizeIdentifier(value);
  if (!hasValidCheckDigit(code)) throw fail('IDENTIFIER_CHECK_DIGIT_INVALID');
  const normalizedTenant = String(tenant ?? '').trim().toLowerCase();
  const asins = buildIndex(mappings).get(`${normalizedTenant}|${code}`) || [];
  if (asins.length === 0) return { status: 'NOT_FOUND', identifier: code, records: [] };
  if (asins.length > 1) return { status: 'AMBIGUOUS', identifier: code, asins: [...asins], records: [] };
  const matched = records.filter((record) =>
    String(record.tenant || '').toLowerCase() === normalizedTenant
    && String(record.asin || '').toUpperCase() === asins[0]);
  if (matched.length !== 1) return { status: 'MASTER_MISMATCH', identifier: code, asins: [...asins], records: [] };
  return { status: 'FOUND', identifier: code, asins: [...asins], records: matched };
}

async function loadApprovedMappings(env, tenant, value) {
  const normalizedTenant = String(tenant ?? '').trim().toLowerCase();
  const result = await env.PRODUCT_DB.prepare(
    `SELECT tenant, asin, identifier_value AS value FROM product_identifiers
     WHERE tenant = ?1 AND identifier_value = ?2 AND approved = 1`
  ).bind(normalizedTenant, value).all();
  return result.results || [];
}

// gas/ProductIdentifierEngine.gs lookupForTenant() のD1版: D1に同期済みの
// 承認済み識別子とproductsテーブルを突き合わせる。D1未設定時はnullを返すので、
// 呼び出し側はGASフォールバック(callGas等)に切り替えること。
export async function lookupIdentifier(env, tenant, value) {
  if (!env.PRODUCT_DB) return null;
  const code = normalizeIdentifier(value);
  if (!hasValidCheckDigit(code)) throw fail('IDENTIFIER_CHECK_DIGIT_INVALID');
  const normalizedTenant = String(tenant ?? '').trim().toLowerCase();
  const mappings = await loadApprovedMappings(env, normalizedTenant, code);
  const asins = [...new Set(mappings.map((row) => row.asin))];
  if (asins.length === 0) return { status: 'NOT_FOUND', identifier: code, records: [] };
  if (asins.length > 1) return { status: 'AMBIGUOUS', identifier: code, asins, records: [] };
  const product = await env.PRODUCT_DB.prepare(
    'SELECT * FROM products WHERE tenant = ?1 AND asin = ?2'
  ).bind(normalizedTenant, asins[0]).first();
  if (!product) return { status: 'MASTER_MISMATCH', identifier: code, asins, records: [] };
  return { status: 'FOUND', identifier: code, asins, records: [product] };
}
