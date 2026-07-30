import test from 'node:test';
import assert from 'node:assert/strict';
import { sellerPageResponse } from '../src/seller-page.mjs';

function testEnv(seenSql = []) {
  return {
    LINE_LOGIN_CHANNEL_ID: 'line-id',
    LINE_LOGIN_CHANNEL_SECRET: 'line-login-secret',
    PRODUCT_DB: { prepare(sql) { seenSql.push(String(sql)); return { all: async () => ({ results:
      String(sql).includes('unmet_demand_events') ? [
        { category: 'kitchen-appliance', outbound_count: 18, unique_users: 9, last_seen_at: '2026-07-24' }
      ] : String(sql).includes('import_restriction_knowledge') ? [
        { tenant: 'itg', restriction_class: 'LITHIUM_BATTERY', demand_count: 8, covered_count: 3 },
        { tenant: 'other', restriction_class: 'LIQUID', demand_count: 12, covered_count: 0 }
      ] : String(sql).includes('sp_api_sync_audit') ? [
        { tenant: 'itg', result: 'SUCCESS', items: 12, completed_at: '2026-07-26T00:00:00Z' }
      ] : String(sql).includes('marketplace_offers') ? [
        { tenant: 'itg', marketplace: 'QOO10_JP', verified_products: 14, stale_products: 2, last_observed_at: '2026-07-30T00:00:00Z' },
        { tenant: 'other', marketplace: 'RAKUTEN_JP', verified_products: 99, stale_products: 0, last_observed_at: '2026-07-30T00:00:00Z' }
      ] : [
        { tenant: 'itg', products: 130386 }, { tenant: 'itt', products: 99972 }, { tenant: 'mc2', products: 96125 }
      ] }) }; } }
  };
}

test('seller console shows readable scoped data and working action links', async () => {
  const response = await sellerPageResponse(testEnv(), {
    account: 'ITG GROUP', tenants: ['itg', 'itt', 'mc2'], plan: 'PARTNER'
  });
  const html = await response.text();
  assert.match(html, /326,483/);
  assert.match(html, /ITG GROUP 管理画面/);
  assert.match(html, /SP-API同期画面を開く/);
  assert.match(html, /LWAアプリ認証<\/span><strong>未設定/);
  assert.match(html, /Qoo10<\/span><strong>確認済み商品URL14件/);
  assert.match(html, /再確認期限超過 2件/);
  assert.doesNotMatch(html, /確認済み商品URL99件/);
  for (const id of ['catalog', 'offers', 'demand', 'integration', 'plan']) {
    assert.match(html, new RegExp(`href="#${id}"`));
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /kitchen-appliance/);
  assert.match(html, /匿名セッション 9件/);
  assert.match(html, /LITHIUM_BATTERY/);
  assert.match(html, /国内代替確認済み 3件/);
  assert.doesNotMatch(html, />LIQUID</);
  assert.match(html, /itg SUCCESS 12件/);
  assert.match(html, /LINEログイン<\/span><strong>設定済み/);
  assert.match(html, /公式アカウント<\/span><strong>未接続/);
  assert.doesNotMatch(html, /繧|縺|蜩/);
});

test('seller console never exposes another tenant totals', async () => {
  const response = await sellerPageResponse(testEnv(), {
    account: 'ITG Seller', tenants: ['itg'], plan: 'LITE'
  });
  const html = await response.text();
  assert.match(html, /130,386/);
  assert.doesNotMatch(html, /99,972/);
  assert.doesNotMatch(html, /96,125/);
  assert.doesNotMatch(html, /kitchen-appliance/);
  assert.match(html, /GROWTH以上/);
});

test('seller demand report excludes QA, unattributed, and legacy traffic', async () => {
  const seenSql = [];
  await sellerPageResponse(testEnv(seenSql), {
    account: 'ITG GROUP', tenants: ['itg'], plan: 'PARTNER'
  });
  const demandSql = seenSql.find((sql) => sql.includes('unmet_demand_events')) || '';
  assert.match(demandSql, /traffic_class='ATTRIBUTED'/);
});
