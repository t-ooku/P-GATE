import test from 'node:test';
import assert from 'node:assert/strict';
import { marketplaceContentHealth } from '../src/marketplace-sales.mjs';

const secret = 'x'.repeat(32);
const request = (authorized = true) => new Request('https://hoshilu.app/api/internal/marketplace-content/health', {
  headers: authorized ? { 'x-hoshilu-internal-secret': secret } : {}
});

function database(rows) {
  let call = 0;
  return { prepare: () => ({ first: async () => rows[call++] ?? null }) };
}

test('記事・セール通知監視は最終成功・失敗と10モール網羅数だけを返す', async () => {
  const env = { MYWATCH_CRON_SECRET: secret, PRODUCT_DB: database([
    { checked_at: '2026-08-01T03:50:00.000Z', status: 'SUCCESS', approved_active_events: 8, covered_marketplaces: 6, queued_notifications: 3, error_code: '' },
    { checked_at: '2026-08-01T03:50:00.000Z' },
    { checked_at: '2026-08-01T02:45:00.000Z', error_code: 'SALE_FEED_TEMPORARY' }
  ]) };
  const response = await marketplaceContentHealth(request(), env, new Date('2026-08-01T04:05:00.000Z'));
  const body = await response.json();
  assert.equal(body.status, 'HEALTHY');
  assert.equal(body.expected_marketplaces, 10);
  assert.equal(body.minutes_since_success, 15);
  assert.equal(body.latest.covered_marketplaces, 6);
  assert.equal(body.last_failure_code, 'SALE_FEED_TEMPORARY');
  assert.equal(JSON.stringify(body).includes(secret), false);
});

test('監視APIはSecretなしを拒否し、30分超の未成功をSTALEにする', async () => {
  assert.equal((await marketplaceContentHealth(request(false), { MYWATCH_CRON_SECRET: secret })).status, 401);
  const env = { MYWATCH_CRON_SECRET: secret, PRODUCT_DB: database([
    { checked_at: '2026-08-01T03:00:00.000Z', status: 'SUCCESS' },
    { checked_at: '2026-08-01T03:00:00.000Z' },
    null
  ]) };
  const body = await (await marketplaceContentHealth(request(), env, new Date('2026-08-01T04:00:01.000Z'))).json();
  assert.equal(body.status, 'STALE');
  assert.equal(body.ok, false);
});
