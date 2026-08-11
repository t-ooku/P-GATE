const ALLOWED_SCOPES = new Set([
  'ALL', 'CATEGORY', 'BRAND', 'MANUFACTURER', 'INVENTORY_MIN', 'AI_RECOMMENDED'
]);
const TEXT_SCOPES = new Set(['CATEGORY', 'BRAND', 'MANUFACTURER']);

function clean(value, limit = 120) {
  return String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, limit);
}

function allowedTenants(seller = {}) {
  return new Set((seller.tenants || []).map((value) => clean(value, 32).toLowerCase()).filter(Boolean));
}

function sellerKey(seller = {}) {
  const value = clean(seller.seller_key, 120);
  if (!/^[A-Za-z0-9_-]{20,120}$/u.test(value)) throw new Error('SELLER_KEY_INVALID');
  return value;
}

function tenantFor(seller, value) {
  const tenant = clean(value, 32).toLowerCase();
  if (!allowedTenants(seller).has(tenant)) throw new Error('SELLER_TENANT_NOT_ALLOWED');
  return tenant;
}

function boolean(value) {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  throw new Error('SELLER_PRIORITY_ACTIVE_INVALID');
}

function scopeValue(scopeType, value) {
  if (scopeType === 'ALL' || scopeType === 'AI_RECOMMENDED') return '*';
  if (scopeType === 'INVENTORY_MIN') {
    const threshold = Number(value);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1_000_000) {
      throw new Error('SELLER_PRIORITY_INVENTORY_INVALID');
    }
    return String(threshold);
  }
  const normalized = clean(value, 80);
  if (normalized.length < 1) throw new Error('SELLER_PRIORITY_SCOPE_VALUE_REQUIRED');
  return normalized;
}

async function verifiedSellerIds(db, tenant) {
  const ids = new Set();
  try {
    const result = await db.prepare(`SELECT DISTINCT seller_id FROM marketplace_offers
      WHERE tenant=?1 AND seller_id<>'' ORDER BY seller_id LIMIT 100`).bind(tenant).all();
    for (const row of result.results || []) {
      const id = clean(row.seller_id, 160);
      if (id) ids.add(id);
    }
  } catch {}
  try {
    const result = await db.prepare(`SELECT DISTINCT merchant_id AS seller_id FROM sp_api_listings
      WHERE tenant=?1 AND merchant_id<>'' ORDER BY merchant_id LIMIT 100`).bind(tenant).all();
    for (const row of result.results || []) {
      const id = clean(row.seller_id, 160);
      if (id) ids.add(id);
    }
  } catch {}
  return [...ids].slice(0, 100);
}

function upsertRuleStatement(db, { sellerKey: key, tenant, scopeType, value, active, now }) {
  return db.prepare(`INSERT INTO seller_priority_rules
    (rule_id,seller_key,tenant,scope_type,scope_value,active,priority_started_at,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?7,?7)
    ON CONFLICT(seller_key,tenant,scope_type,scope_value) DO UPDATE SET
      active=excluded.active,
      priority_started_at=CASE
        WHEN seller_priority_rules.active=0 AND excluded.active=1 THEN excluded.priority_started_at
        ELSE seller_priority_rules.priority_started_at END,
      updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), key, tenant, scopeType, value, active, now);
}

function auditStatement(db, { sellerKey: key, tenant, action, targetType, targetValue, now }) {
  return db.prepare(`INSERT INTO seller_console_audit
    (audit_id,seller_key,tenant,action,target_type,target_value,occurred_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7)`)
    .bind(crypto.randomUUID(), key, tenant, action, targetType, targetValue, now);
}

export async function changeSellerPriority(env, seller, input = {}, now = new Date().toISOString()) {
  if (!env.PRODUCT_DB) throw new Error('SELLER_PRIORITY_STORE_UNAVAILABLE');
  const db = env.PRODUCT_DB;
  const key = sellerKey(seller);
  const action = clean(input.action, 40).toUpperCase();
  if (!['SET_ALL','UPSERT_RULE','SET_RULE_STATUS'].includes(action)) {
    throw new Error('SELLER_PRIORITY_ACTION_INVALID');
  }

  if (action === 'SET_RULE_STATUS') {
    const ruleId = clean(input.rule_id, 80);
    if (!/^[A-Za-z0-9_-]{10,80}$/u.test(ruleId)) throw new Error('SELLER_PRIORITY_RULE_INVALID');
    const active = boolean(input.active);
    const row = await db.prepare(`SELECT rule_id,tenant,scope_type,scope_value,active
      FROM seller_priority_rules WHERE rule_id=?1 AND seller_key=?2`).bind(ruleId, key).first();
    if (!row || !allowedTenants(seller).has(String(row.tenant))) {
      throw new Error('SELLER_PRIORITY_RULE_NOT_FOUND');
    }
    await db.batch([
      db.prepare(`UPDATE seller_priority_rules SET active=?1,
        priority_started_at=CASE WHEN active=0 AND ?1=1 THEN ?2 ELSE priority_started_at END,
        updated_at=?2 WHERE rule_id=?3 AND seller_key=?4`).bind(active, now, ruleId, key),
      auditStatement(db, {
        sellerKey: key, tenant: String(row.tenant),
        action: active ? 'PRIORITY_RULE_ENABLED' : 'PRIORITY_RULE_DISABLED',
        targetType: String(row.scope_type), targetValue: String(row.scope_value), now
      })
    ]);
    return { ok: true, action, rule_id: ruleId, active: Boolean(active) };
  }

  const tenant = tenantFor(seller, input.tenant);
  const scopeType = action === 'SET_ALL' ? 'ALL' : clean(input.scope_type, 32).toUpperCase();
  if (!ALLOWED_SCOPES.has(scopeType)) throw new Error('SELLER_PRIORITY_SCOPE_INVALID');
  if (action === 'UPSERT_RULE' && !TEXT_SCOPES.has(scopeType) &&
      !['INVENTORY_MIN','AI_RECOMMENDED'].includes(scopeType)) {
    throw new Error('SELLER_PRIORITY_SCOPE_INVALID');
  }
  const value = scopeValue(scopeType, input.scope_value);
  const active = scopeType === 'INVENTORY_MIN' ? 1 : boolean(input.active);
  const sellerIds = await verifiedSellerIds(db, tenant);
  const statements = [
    ...(action === 'SET_ALL' && active === 0
      ? [db.prepare(`UPDATE seller_priority_rules SET active=0,updated_at=?1
          WHERE seller_key=?2 AND tenant=?3`).bind(now, key, tenant)]
      : []),
    upsertRuleStatement(db, { sellerKey: key, tenant, scopeType, value, active, now }),
    auditStatement(db, {
      sellerKey: key, tenant,
      action: active ? 'PRIORITY_RULE_ENABLED' : 'PRIORITY_RULE_DISABLED',
      targetType: scopeType, targetValue: value, now
    }),
    ...sellerIds.map((sellerId) => db.prepare(`INSERT INTO seller_priority_memberships
      (seller_key,tenant,seller_id,verified_at) VALUES(?1,?2,?3,?4)
      ON CONFLICT(seller_key,tenant,seller_id) DO UPDATE SET verified_at=excluded.verified_at`)
      .bind(key, tenant, sellerId, now))
  ];
  await db.batch(statements);
  return {
    ok: true, action, tenant, scope_type: scopeType, scope_value: value,
    active: Boolean(active), mapped_seller_ids: sellerIds.length
  };
}

export function sellerPriorityClientError(error) {
  return new Set([
    'SELLER_KEY_INVALID','SELLER_TENANT_NOT_ALLOWED','SELLER_PRIORITY_ACTIVE_INVALID',
    'SELLER_PRIORITY_INVENTORY_INVALID','SELLER_PRIORITY_SCOPE_VALUE_REQUIRED',
    'SELLER_PRIORITY_ACTION_INVALID','SELLER_PRIORITY_RULE_INVALID',
    'SELLER_PRIORITY_RULE_NOT_FOUND','SELLER_PRIORITY_SCOPE_INVALID'
  ]).has(String(error?.message || error));
}

function normalizedMatch(value) {
  return clean(value, 160).toLocaleLowerCase('ja-JP').replace(/\s+/gu, '');
}

function scopeMatches(rule, candidate = {}) {
  const expected = normalizedMatch(rule.scope_value);
  if (rule.scope_type === 'ALL') return true;
  if (rule.scope_type === 'CATEGORY') {
    const actual = normalizedMatch(candidate.category || candidate.related_category);
    return Boolean(actual && (actual === expected || actual.includes(expected) || expected.includes(actual)));
  }
  if (rule.scope_type === 'BRAND') {
    return normalizedMatch(candidate.brand) === expected;
  }
  if (rule.scope_type === 'MANUFACTURER') {
    return normalizedMatch(candidate.manufacturer) === expected;
  }
  if (rule.scope_type === 'AI_RECOMMENDED') return candidate.ai_recommended === true;
  return false;
}

function offerKey(offer = {}) {
  return `${clean(offer.tenant, 32).toLowerCase()}\n${clean(offer.seller_id, 160)}`;
}

export async function sellerPriorityContext(env, candidates = []) {
  if (!env.PRODUCT_DB) return new Map();
  const sellerIds = [...new Set(candidates.flatMap((candidate) =>
    (candidate.offers || []).map((offer) => clean(offer.seller_id, 160)).filter(Boolean)
  ))].slice(0, 500);
  if (!sellerIds.length) return new Map();
  const context = new Map();
  try {
    for (let offset = 0; offset < sellerIds.length; offset += 50) {
      const batch = sellerIds.slice(offset, offset + 50);
      const placeholders = batch.map((_, index) => `?${index + 1}`).join(',');
      const result = await env.PRODUCT_DB.prepare(`SELECT m.tenant,m.seller_id,r.scope_type,
        r.scope_value,r.priority_started_at,w.status AS wallet_status,
        COALESCE(w.balance_micros_jpy,0)-COALESCE(w.reserved_micros_jpy,0) AS available_micros_jpy
        FROM seller_priority_memberships m
        JOIN seller_priority_rules r ON r.seller_key=m.seller_key AND r.tenant=m.tenant AND r.active=1
        LEFT JOIN seller_billing_wallets w ON w.seller_key=m.seller_key
        WHERE m.seller_id IN (${placeholders})
        ORDER BY r.priority_started_at,r.rule_id`).bind(...batch).all();
      for (const row of result.results || []) {
        const key = `${clean(row.tenant, 32).toLowerCase()}\n${clean(row.seller_id, 160)}`;
        if (!context.has(key)) context.set(key, []);
        context.get(key).push(row);
      }
    }
  } catch {
    return new Map();
  }
  return context;
}

export function applySellerPriority(candidate = {}, offers = [], context = new Map()) {
  return (offers || []).map((offer) => {
    const exact = context.get(offerKey(offer)) || [];
    const fallbackGroups = !clean(offer.tenant, 32)
      ? [...context.entries()].filter(([key]) => key.endsWith(`\n${clean(offer.seller_id, 160)}`))
      : [];
    // Legacy offers without a tenant are accepted only when the seller ID maps
    // to exactly one tenant. Ambiguous IDs must never inherit another store's rule.
    const fallback = fallbackGroups.length === 1 ? fallbackGroups[0][1] : [];
    const rules = exact.length ? exact : fallback;
    if (!rules.length) return offer;
    const walletReady = rules.some((rule) =>
      rule.wallet_status === 'ACTIVE' && Number(rule.available_micros_jpy || 0) > 0
    );
    if (!walletReady) return offer;
    const minimumStock = rules
      .filter((rule) => rule.scope_type === 'INVENTORY_MIN')
      .reduce((maximum, rule) => Math.max(maximum, Number(rule.scope_value) || 0), 0);
    const knownStock = Number(offer.quantity ?? offer.stock);
    if (minimumStock > 0 && (!Number.isFinite(knownStock) || knownStock < minimumStock)) return offer;
    const matched = rules.filter((rule) => scopeMatches(rule, candidate));
    if (!matched.length) return offer;
    const priorityStartedAt = matched.map((rule) => String(rule.priority_started_at || '')).sort()[0];
    return { ...offer, priority_listing: true, priority_started_at: priorityStartedAt };
  });
}
