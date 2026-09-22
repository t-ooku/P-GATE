import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpApiD1Repository, fullScanTenantForSchedule,
  runSpApiScheduledSync, spApiConfiguredTenants
} from '../src/sp-api-d1-repository.mjs';
import { attachSpApiOffers } from '../src/product-index-v2.mjs';

test('SP-API cronはSecretが揃ったテナントだけを対象にする', () => {
  const tenants = spApiConfiguredTenants({
    SPAPI_LWA_CLIENT_ID: 'client',
    SPAPI_LWA_CLIENT_SECRET: 'secret',
    SPAPI_REFRESH_TOKEN_ITG: 'itg-token',
    SPAPI_REFRESH_TOKEN_MC2: 'mc2-token'
  });
  assert.deepEqual(tenants, ['itg', 'mc2']);
});

test('日次全件照合は3テナントを1時間ずつ分散する', () => {
  assert.equal(fullScanTenantForSchedule(new Date('2026-07-25T18:00:00Z')), 'itg');
  assert.equal(fullScanTenantForSchedule(new Date('2026-07-25T19:00:00Z')), 'itt');
  assert.equal(fullScanTenantForSchedule(new Date('2026-07-25T20:00:00Z')), 'mc2');
  assert.equal(fullScanTenantForSchedule(new Date('2026-07-25T18:15:00Z')), '');
});

test('SP-API D1リポジトリは全件照合で未確認SKUを即削除しない', async () => {
  let statement = '';
  const db = {
    prepare(sql) {
      statement = sql;
      return { bind() { return { run: async () => ({ meta: { changes: 1 } }) }; } };
    }
  };
  await createSpApiD1Repository(db).finishFullScan('itg', 'sync-current', '2026-07-26T00:00:00Z');
  assert.match(statement, /missing_scan_count\+1/);
  assert.match(statement, /buyable=CASE/);
  assert.doesNotMatch(statement, /DELETE/i);
});

test('SP-API未設定環境では外部通信せず安全に終了する', async () => {
  let fetched = false;
  const result = await runSpApiScheduledSync({
    PRODUCT_DB: {}
  }, new Date(), async () => {
    fetched = true;
    throw new Error('must not fetch');
  });
  assert.deepEqual(result.configured, []);
  assert.equal(fetched, false);
});

test('購入可能なSP-API出品だけを公開検索候補へ接続する', async () => {
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        assert.match(sql, /buyable=1 AND discoverable=1 AND missing_from_amazon=0/);
        return {
          bind() {
            return { all: async () => ({ results: [{
              tenant: 'itg', merchant_id: 'merchant', seller_sku: 'SKU-1',
              asin: 'B000000001', product_url: 'https://www.amazon.co.jp/dp/B000000001',
              price: 1980, currency: 'JPY', quantity: 4,
              created_at_amazon: '2026-07-01T00:00:00Z'
            }] }) };
          }
        };
      }
    }
  };
  const [candidate] = await attachSpApiOffers(env, 'itg', [{ asin: 'B000000001' }]);
  assert.equal(candidate.offers.length, 1);
  assert.equal(candidate.offers[0].stock_status, 'IN_STOCK');
  assert.equal(candidate.offers[0].source, 'amazon_sp_api');
});

test('cronの各処理は一つの失敗で他処理を中断しない', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /Promise\.allSettled\(\[\s*runDueSocialPosts/);
});
