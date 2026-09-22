import { SP_API_SELLERS, synchronizeSeller } from './sp-api-sync.mjs';

const MAX_BATCH = 100;
const json = (value) => JSON.stringify(Array.isArray(value) ? value : []);

export function createSpApiD1Repository(db) {
  if (!db) throw new Error('SP_API_STORE_NOT_CONFIGURED');
  return {
    async getCursor(tenant) {
      const row = await db.prepare(
        'SELECT cursor_at FROM sp_api_sync_cursors WHERE tenant=?1'
      ).bind(tenant).first();
      return row?.cursor_at || '';
    },
    async upsertListings(tenant, listings) {
      for (let offset = 0; offset < listings.length; offset += MAX_BATCH) {
        const statements = listings.slice(offset, offset + MAX_BATCH).map((item) =>
          db.prepare(`INSERT INTO sp_api_listings
          (tenant,seller_sku,marketplace_id,store_name,merchant_id,asin,product_name,
           product_type,condition_type,image_url,created_at_amazon,updated_at_amazon,
           buyable,discoverable,status_json,quantity,price,currency,issues_json,
           product_url,sync_id,observed_at,missing_from_amazon,missing_scan_count,source)
          VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,
           ?18,?19,?20,?21,?22,0,0,?23)
          ON CONFLICT(tenant,seller_sku,marketplace_id) DO UPDATE SET
          store_name=excluded.store_name,merchant_id=excluded.merchant_id,
          asin=excluded.asin,product_name=excluded.product_name,
          product_type=excluded.product_type,condition_type=excluded.condition_type,
          image_url=excluded.image_url,created_at_amazon=excluded.created_at_amazon,
          updated_at_amazon=excluded.updated_at_amazon,buyable=excluded.buyable,
          discoverable=excluded.discoverable,status_json=excluded.status_json,
          quantity=excluded.quantity,price=excluded.price,currency=excluded.currency,
          issues_json=excluded.issues_json,product_url=excluded.product_url,
          sync_id=excluded.sync_id,observed_at=excluded.observed_at,
          missing_from_amazon=0,missing_scan_count=0,source=excluded.source`)
            .bind(
              tenant, item.seller_sku, item.marketplace_id, item.store_name,
              item.merchant_id, item.asin, item.product_name, item.product_type,
              item.condition_type, item.image_url, item.created_at_amazon,
              item.updated_at_amazon, Number(item.buyable), Number(item.discoverable),
              json(item.status), item.quantity, item.price, item.currency,
              json(item.issues), item.product_url, item.sync_id, item.observed_at,
              item.source
            )
        );
        await db.batch(statements);
      }
    },
    async setCursor(tenant, cursor) {
      const now = new Date().toISOString();
      await db.prepare(`INSERT INTO sp_api_sync_cursors(tenant,cursor_at,updated_at)
        VALUES(?1,?2,?3) ON CONFLICT(tenant) DO UPDATE SET
        cursor_at=excluded.cursor_at,updated_at=excluded.updated_at`)
        .bind(tenant, cursor, now).run();
    },
    async appendAudit(event) {
      await db.prepare(`INSERT INTO sp_api_sync_audit
        (audit_id,type,tenant,seller_id,sync_id,result,pages,items,from_at,to_at,
         error_code,completed_at)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`)
        .bind(
          crypto.randomUUID(), event.type, event.tenant, event.seller_id || '',
          event.sync_id || '', event.result || 'SUCCESS', Number(event.pages || 0),
          Number(event.items || 0), event.from || '', event.to || '',
          event.error_code || '', event.completed_at || new Date().toISOString()
        ).run();
    },
    async finishFullScan(tenant, syncId, observedAt) {
      await db.prepare(`UPDATE sp_api_listings SET
        missing_from_amazon=CASE WHEN sync_id<>?2 THEN 1 ELSE 0 END,
        missing_scan_count=CASE WHEN sync_id<>?2 THEN missing_scan_count+1 ELSE 0 END,
        buyable=CASE WHEN sync_id<>?2 THEN 0 ELSE buyable END,
        discoverable=CASE WHEN sync_id<>?2 THEN 0 ELSE discoverable END,
        observed_at=?3
        WHERE tenant=?1`).bind(tenant, syncId, observedAt).run();
    }
  };
}

export function spApiConfiguredTenants(env = {}) {
  if (!env.SPAPI_LWA_CLIENT_ID || !env.SPAPI_LWA_CLIENT_SECRET) return [];
  return Object.entries(SP_API_SELLERS)
    .filter(([, seller]) => Boolean(env[seller.refreshTokenBinding]))
    .map(([tenant]) => tenant);
}

export function fullScanTenantForSchedule(now = new Date()) {
  const date = new Date(now);
  if (date.getUTCMinutes() !== 0) return '';
  return ({ 18: 'itg', 19: 'itt', 20: 'mc2' })[date.getUTCHours()] || '';
}

export async function runSpApiScheduledSync(env, now = new Date(), fetchImpl = fetch) {
  if (!env.PRODUCT_DB) return { configured: [], succeeded: [], failed: [] };
  const configured = spApiConfiguredTenants(env);
  const repository = createSpApiD1Repository(env.PRODUCT_DB);
  const fullTenant = fullScanTenantForSchedule(now);
  const succeeded = [];
  const failed = [];
  for (const tenant of configured) {
    try {
      const result = await synchronizeSeller({
        tenant, env, repository, fetchImpl, full: tenant === fullTenant, now
      });
      succeeded.push({
        tenant, items: result.itemCount, pages: result.pageCount,
        full: tenant === fullTenant
      });
    } catch (error) {
      const errorCode = String(error?.message || 'SP_API_SYNC_FAILED').slice(0, 120);
      failed.push({ tenant, error_code: errorCode });
      await repository.appendAudit({
        type: 'sp_api_incremental_sync',
        tenant,
        seller_id: SP_API_SELLERS[tenant].sellerId,
        result: 'FAILED',
        error_code: errorCode,
        completed_at: new Date().toISOString()
      });
    }
  }
  return { configured, succeeded, failed };
}
