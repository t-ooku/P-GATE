// GAS(gas/ContractPolicySyncEngine.gs)からClient_Contractsのスナップショットを
// 受け取り、D1のcontractsテーブルへ反映する。パターンはproduct-index.mjsの
// syncProducts()と同じ(Bearer認証・バッチID重複排除・row変化検知のON CONFLICT)。
import { normalizeContract } from './contract-policy.mjs';

const MAX_SYNC_RECORDS = 200;

function authorized(request, env) {
  const expected = String(env.CONTRACT_SYNC_SECRET || env.GAS_BRIDGE_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return expected.length >= 32 && received === expected;
}

export function validateContractSyncPayload(payload) {
  const batchId = String(payload?.batch_id ?? '').trim();
  const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(batchId)) throw new Error('CONTRACT_SYNC_BATCH_INVALID');
  if (!contracts.length || contracts.length > MAX_SYNC_RECORDS) throw new Error('CONTRACT_SYNC_RECORD_COUNT_INVALID');
  return { batch_id: batchId, contracts: contracts.map((item) => normalizeContract(item)) };
}

export async function handleContractPolicySyncRoutes(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/internal/contracts/sync') return null;
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
    input = validateContractSyncPayload(await request.json());
  } catch (error) {
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 400 });
  }
  const exists = await env.PRODUCT_DB.prepare(
    'SELECT batch_id FROM contract_sync_batches WHERE batch_id = ?1'
  ).bind(input.batch_id).first();
  if (exists) return Response.json({ ok: true, duplicate: true, changed: 0 });

  const sql = `INSERT INTO contracts (
    contract_id,tenant,account_type,account_id,status,start_date,end_date,category_scope,
    competitor_group,exclusivity_mode,competitor_acceptance,benchmark_consent,updated_at
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
  ON CONFLICT(contract_id) DO UPDATE SET
    tenant=excluded.tenant,account_type=excluded.account_type,account_id=excluded.account_id,
    status=excluded.status,start_date=excluded.start_date,end_date=excluded.end_date,
    category_scope=excluded.category_scope,competitor_group=excluded.competitor_group,
    exclusivity_mode=excluded.exclusivity_mode,competitor_acceptance=excluded.competitor_acceptance,
    benchmark_consent=excluded.benchmark_consent,updated_at=excluded.updated_at
  WHERE contracts.updated_at<>excluded.updated_at`;
  const prepared = env.PRODUCT_DB.prepare(sql);
  const statements = input.contracts.map((contract) => prepared.bind(
    contract.contract_id, contract.tenant, contract.account_type, contract.account_id, contract.status,
    contract.start_date, contract.end_date, JSON.stringify(contract.categories), contract.competitor_group,
    contract.exclusivity_mode, contract.competitor_acceptance ? 1 : 0, contract.benchmark_consent ? 1 : 0,
    contract.updated_at
  ));
  const results = await env.PRODUCT_DB.batch(statements);
  const changed = results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
  await env.PRODUCT_DB.prepare(
    'INSERT INTO contract_sync_batches(batch_id,received_count,changed_count,received_at) VALUES(?1,?2,?3,?4)'
  ).bind(input.batch_id, input.contracts.length, changed, new Date().toISOString()).run();
  return Response.json({ ok: true, duplicate: false, received: input.contracts.length, changed });
}
