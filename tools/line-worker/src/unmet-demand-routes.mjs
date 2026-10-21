const RESTRICTION_CLASSES = new Set([
  'LIQUID', 'LITHIUM_BATTERY', 'HAZARDOUS_AIR_CARGO',
  'OVERSIZE_OR_OVERWEIGHT', 'FOOD_PLANT_ANIMAL',
  'REGULATORY_OR_CERTIFICATION', 'PRICE', 'DELIVERY_TIME',
  'CUSTOMER_CHANGED_MIND', 'OUT_OF_STOCK', 'UNKNOWN'
]);
const ALTERNATIVE_STATUSES = new Set(['UNRESOLVED', 'CANDIDATE', 'VERIFIED', 'REJECTED']);
const VERIFICATION_LEVELS = new Set(['UNVERIFIED', 'HUMAN_REQUIRED', 'HUMAN_VERIFIED']);

function same(a, b) {
  const left = new TextEncoder().encode(String(a || ''));
  const right = new TextEncoder().encode(String(b || ''));
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

function authorized(request, env) {
  const expected = String(env.UNMET_DEMAND_SYNC_SECRET || '');
  return expected.length >= 32
    && same(request.headers.get('x-hoshilu-internal-secret'), expected);
}

function normalizeRecord(input = {}) {
  const forbidden = [
    'order_id', 'customer_name', 'name', 'address', 'phone', 'email',
    'reason', 'reason_text', 'query', 'question'
  ];
  if (forbidden.some((key) => Object.hasOwn(input, key))) {
    throw new Error('RAW_ORDER_DATA_FORBIDDEN');
  }
  const tenant = String(input.tenant || '').trim().toLowerCase();
  const sourceOrderHash = String(input.source_order_hash || '').trim().toLowerCase();
  const sourceProductId = String(input.source_product_id || '').trim().toUpperCase();
  const restrictionClass = String(input.restriction_class || '').trim().toUpperCase();
  const occurredMonth = String(input.occurred_month || '').trim();
  const alternativeStatus = String(input.domestic_alternative_status || 'UNRESOLVED').trim().toUpperCase();
  const verificationLevel = String(input.verification_level || 'UNVERIFIED').trim().toUpperCase();
  const alternatives = [...new Set((Array.isArray(input.verified_alternative_ids)
    ? input.verified_alternative_ids : []).map((value) => String(value || '').trim().toUpperCase())
    .filter((value) => /^[A-Z0-9:_-]{3,64}$/.test(value)))].slice(0, 3);
  if (!/^[a-z0-9_-]{2,32}$/.test(tenant)) throw new Error('TENANT_INVALID');
  if (!/^[a-f0-9]{64}$/.test(sourceOrderHash)) throw new Error('ORDER_HASH_INVALID');
  if (sourceProductId && !/^[A-Z0-9:_-]{3,64}$/.test(sourceProductId)) throw new Error('PRODUCT_ID_INVALID');
  if (!RESTRICTION_CLASSES.has(restrictionClass)) throw new Error('RESTRICTION_CLASS_INVALID');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(occurredMonth)) throw new Error('OCCURRED_MONTH_INVALID');
  if (!ALTERNATIVE_STATUSES.has(alternativeStatus)) throw new Error('ALTERNATIVE_STATUS_INVALID');
  if (!VERIFICATION_LEVELS.has(verificationLevel)) throw new Error('VERIFICATION_LEVEL_INVALID');
  if (alternatives.length && verificationLevel !== 'HUMAN_VERIFIED') {
    throw new Error('ALTERNATIVE_REQUIRES_HUMAN_VERIFICATION');
  }
  return {
    tenant, source_order_hash: sourceOrderHash, source_product_id: sourceProductId,
    restriction_class: restrictionClass, occurred_month: occurredMonth,
    anonymous_demand_count: Math.max(1, Math.min(1000, Number(input.anonymous_demand_count) || 1)),
    domestic_alternative_status: alternativeStatus,
    verified_alternative_ids: alternatives,
    verification_level: verificationLevel
  };
}

export function normalizeRestrictionKnowledgeBatch(input = {}) {
  const records = Array.isArray(input.records) ? input.records : [];
  if (!records.length || records.length > 200) throw new Error('RECORD_BATCH_INVALID');
  return records.map(normalizeRecord);
}

export async function handleUnmetDemandRoutes(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/internal/unmet-demand/sync') return null;
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }
  if (!authorized(request, env)) {
    return Response.json({ ok: false, error: 'UNMET_DEMAND_UNAUTHORIZED' }, { status: 401 });
  }
  if (!env.PRODUCT_DB) {
    return Response.json({ ok: false, error: 'UNMET_DEMAND_STORE_NOT_CONFIGURED' }, { status: 503 });
  }
  let records;
  try {
    records = normalizeRestrictionKnowledgeBatch(await request.json());
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
  const now = new Date().toISOString();
  const statements = records.map((record) => env.PRODUCT_DB.prepare(
    `INSERT INTO import_restriction_knowledge
    (tenant,source_order_hash,source_product_id,restriction_class,occurred_month,
     anonymous_demand_count,domestic_alternative_status,verified_alternative_ids,
     verification_level,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
    ON CONFLICT(tenant,source_order_hash) DO UPDATE SET
    source_product_id=excluded.source_product_id,
    restriction_class=excluded.restriction_class,
    occurred_month=excluded.occurred_month,
    anonymous_demand_count=excluded.anonymous_demand_count,
    domestic_alternative_status=excluded.domestic_alternative_status,
    verified_alternative_ids=excluded.verified_alternative_ids,
    verification_level=excluded.verification_level,
    updated_at=excluded.updated_at`
  ).bind(
    record.tenant, record.source_order_hash, record.source_product_id,
    record.restriction_class, record.occurred_month, record.anonymous_demand_count,
    record.domestic_alternative_status, JSON.stringify(record.verified_alternative_ids),
    record.verification_level, now
  ));
  await env.PRODUCT_DB.batch(statements);
  return Response.json({ ok: true, accepted: records.length });
}
