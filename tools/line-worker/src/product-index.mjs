const MAX_SYNC_RECORDS = 200;
const MAX_QUERY_LENGTH = 200;

function clean(value, max = 500) {
  return String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeSearchQuery(value) {
  return clean(value, MAX_QUERY_LENGTH).toLowerCase();
}

const QUERY_EXPANSIONS = [
  [/(お菓子|菓子|零食|糖果|과자|사탕)/u, ['snack','candy','chocolate','cookie']],
  [/(シリアル|麦片|穀物|시리얼)/u, ['cereal','granola','oat']],
  [/(フィギュア|人偶|模型|피규어)/u, ['figure','collectible','statue']],
  [/(車|自動車|汽车|汽車|자동차|차량)/u, ['car','automotive','vehicle']],
  [/(パーツ|部品|零件|配件|부품|파트)/u, ['part','parts','replacement']],
  [/(家電|電化製品|电器|家用电器|가전)/u, ['appliance','electronics','electric']],
  [/(サプリ|健康食品|保健品|영양제)/u, ['supplement','vitamin','nutrition']],
  [/(液体|リキッド|液态|액체)/u, ['liquid','fluid']],
  [/(リチウム|锂|리튬)/u, ['lithium','battery']],
  [/(大型|大きい|大件|대형)/u, ['large','oversize']]
];
export function expandedSearchTerms(value) {
  const normalized=normalizeSearchQuery(value),direct=normalized.match(/[\p{L}\p{N}ー]{2,}/gu)||[],expanded=[];
  for(const [pattern,terms] of QUERY_EXPANSIONS)if(pattern.test(normalized))expanded.push(...terms);
  return [...new Set([...expanded,...direct.filter(term=>/^[a-z0-9]+$/i.test(term))])].slice(0,12);
}
export function ftsQuery(value) {
  const normalized=normalizeSearchQuery(value);
  const vehicle=/(車|自動車|汽车|汽車|자동차|차량|car|automotive|vehicle)/u.test(normalized);
  const part=/(パーツ|部品|零件|配件|부품|파트|part|replacement)/u.test(normalized);
  if(vehicle&&part)return '("car"* OR "automotive"* OR "vehicle"*) AND ("part"* OR "parts"* OR "replacement"*)';
  const tokens=expandedSearchTerms(value);
  return tokens.map(token=>`"${token.replaceAll('"','""')}"*`).join(' OR ');
}

export function validateSyncPayload(payload) {
  const tenant = clean(payload?.tenant, 40).toLowerCase();
  const batchId = clean(payload?.batch_id, 100);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (!/^[a-z0-9_-]{2,40}$/.test(tenant)) throw new Error('SYNC_TENANT_INVALID');
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(batchId)) throw new Error('SYNC_BATCH_INVALID');
  if (!records.length || records.length > MAX_SYNC_RECORDS) throw new Error('SYNC_RECORD_COUNT_INVALID');
  return {
    tenant, batch_id: batchId,
    records: records.map((record) => ({
      record_key: clean(record.record_key, 160),
      asin: clean(record.asin, 20).toUpperCase(),
      sku: clean(record.sku, 100),
      product_name: clean(record.product_name, 500),
      manufacturer: clean(record.manufacturer, 200),
      image_url: clean(record.image || record.image_url, 1000),
      stock: Math.max(0, Math.trunc(Number(record.stock || 0))),
      amazon_jp_url: clean(record.amazon_jp_url, 1000),
      amazon_us_url: clean(record.amazon_us_url, 1000),
      search_aliases: Array.isArray(record.search_aliases) ? record.search_aliases.map((item) => clean(item, 160)).filter(Boolean).join(' ') : clean(record.search_aliases, 2000),
      localized_content: JSON.stringify(record.localized_content || {}),
      row_hash: clean(record.row_hash, 128),
      imported_at: clean(record.imported_at, 40)
    }))
  };
}

function authorized(request, env) {
  const expected = String(env.PRODUCT_SYNC_SECRET || env.GAS_BRIDGE_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return expected.length >= 32 && received === expected;
}

export async function syncProducts(request, env) {
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  if (!authorized(request, env)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const input = validateSyncPayload(await request.json());
    const exists = await env.PRODUCT_DB.prepare('SELECT batch_id FROM product_sync_batches WHERE batch_id = ?1').bind(input.batch_id).first();
    if (exists) return Response.json({ ok: true, duplicate: true, changed: 0 });
    const sql = `INSERT INTO products (
      tenant,record_key,asin,sku,product_name,manufacturer,image_url,stock,amazon_jp_url,amazon_us_url,
      search_aliases,localized_content,row_hash,imported_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
    ON CONFLICT(tenant,record_key) DO UPDATE SET
      asin=excluded.asin,sku=excluded.sku,product_name=excluded.product_name,manufacturer=excluded.manufacturer,
      image_url=excluded.image_url,stock=excluded.stock,amazon_jp_url=excluded.amazon_jp_url,
      amazon_us_url=excluded.amazon_us_url,search_aliases=excluded.search_aliases,
      localized_content=excluded.localized_content,row_hash=excluded.row_hash,imported_at=excluded.imported_at
    WHERE products.row_hash<>excluded.row_hash`;
    const prepared = env.PRODUCT_DB.prepare(sql);
    const statements = input.records.map((row) => prepared.bind(
      input.tenant,row.record_key,row.asin,row.sku,row.product_name,row.manufacturer,row.image_url,row.stock,
      row.amazon_jp_url,row.amazon_us_url,row.search_aliases,row.localized_content,row.row_hash,row.imported_at
    ));
    const results = await env.PRODUCT_DB.batch(statements);
    const changed = results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
    await env.PRODUCT_DB.prepare('INSERT INTO product_sync_batches(batch_id,tenant,received_count,changed_count,received_at) VALUES(?1,?2,?3,?4,?5)')
      .bind(input.batch_id,input.tenant,input.records.length,changed,new Date().toISOString()).run();
    return Response.json({ ok: true, duplicate: false, received: input.records.length, changed });
  } catch (error) {
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 400 });
  }
}

export async function searchProducts(env, tenant, query, limit = 30) {
  if (!env.PRODUCT_DB) return null;
  const match = ftsQuery(query);
  if (!match) return [];
  const result = await env.PRODUCT_DB.prepare(`SELECT p.*, bm25(product_search,10.0,4.0,2.0) AS text_rank
    FROM product_search JOIN products p ON p.rowid=product_search.rowid
    WHERE product_search MATCH ?1 AND p.tenant=?2
    ORDER BY text_rank ASC, p.stock DESC LIMIT ?3`).bind(match, clean(tenant, 40).toLowerCase(), Math.min(Math.max(Number(limit) || 30, 1), 100)).all();
  return result.results || [];
}
