// GAS(gas/ProductIdentifierSyncEngine.gs)からProduct_Identifiersのスナップ
// ショット(承認状態を含む全行)を受け取り、D1のproduct_identifiersへ反映する。
// contract-policy-routes.mjs / multilingual-seo-routes.mjsと同じ認証・
// 重複排除パターン。
import { validateType, normalizeIdentifier } from './product-identifier.mjs';

const MAX_RECORDS_PER_REQUEST = 200;

function authorized(request, env) {
  const expected = String(env.PRODUCT_IDENTIFIER_SYNC_SECRET || env.GAS_BRIDGE_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return expected.length >= 32 && received === expected;
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeEntry(source = {}) {
  const tenant = String(source.tenant ?? '').trim().toLowerCase();
  const asin = String(source.asin ?? '').trim().toUpperCase();
  const type = String(source.identifier_type ?? '').trim().toUpperCase();
  const approved = source.approved === true || source.approved === 1 || String(source.approved ?? '').toUpperCase() === 'TRUE';
  if (!tenant) throw fail('IDENTIFIER_TENANT_REQUIRED');
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw fail('IDENTIFIER_ASIN_REQUIRED');
  // 未承認行は形式チェックのみ緩く通す(gas/ProductIdentifierEngine.gs
  // normalizeRow()も承認済み行だけを厳密検証し、未承認は素通しする)。
  const value = approved ? validateType(type, source.identifier_value) : normalizeIdentifier(source.identifier_value);
  return {
    tenant, asin, identifier_type: type, identifier_value: value,
    source: String(source.source ?? '').trim().slice(0, 100),
    approved, updated_at: source.updated_at || new Date().toISOString()
  };
}

export function validateProductIdentifierSyncPayload(payload) {
  const batchId = String(payload?.batch_id ?? '').trim();
  const identifiers = Array.isArray(payload?.identifiers) ? payload.identifiers : [];
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(batchId)) throw fail('IDENTIFIER_SYNC_BATCH_INVALID');
  if (!identifiers.length || identifiers.length > MAX_RECORDS_PER_REQUEST) throw fail('IDENTIFIER_SYNC_RECORD_COUNT_INVALID');
  return { batch_id: batchId, identifiers: identifiers.map((item) => normalizeEntry(item)) };
}

export async function handleProductIdentifierSyncRoutes(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/internal/product-identifiers/sync') return null;
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }
  if (!env.PRODUCT_DB) {
    return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  }
  if (!authorized(request, env)) {
    return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  let input;
  try {
    input = validateProductIdentifierSyncPayload(await request.json());
  } catch (error) {
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 400 });
  }
  const exists = await env.PRODUCT_DB.prepare(
    'SELECT batch_id FROM product_identifier_sync_batches WHERE batch_id = ?1'
  ).bind(input.batch_id).first();
  if (exists) return Response.json({ ok: true, duplicate: true });

  const sql = `INSERT INTO product_identifiers (tenant,asin,identifier_type,identifier_value,source,approved,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7)
    ON CONFLICT(tenant,asin,identifier_type,identifier_value) DO UPDATE SET
      source=excluded.source, approved=excluded.approved, updated_at=excluded.updated_at
    WHERE product_identifiers.updated_at<>excluded.updated_at`;
  const prepared = env.PRODUCT_DB.prepare(sql);
  const statements = input.identifiers.map((entry) => prepared.bind(
    entry.tenant, entry.asin, entry.identifier_type, entry.identifier_value, entry.source,
    entry.approved ? 1 : 0, entry.updated_at
  ));
  await env.PRODUCT_DB.batch(statements);
  await env.PRODUCT_DB.prepare(
    'INSERT INTO product_identifier_sync_batches(batch_id,received_count,received_at) VALUES(?1,?2,?3)'
  ).bind(input.batch_id, input.identifiers.length, new Date().toISOString()).run();
  return Response.json({ ok: true, duplicate: false, received: input.identifiers.length });
}
