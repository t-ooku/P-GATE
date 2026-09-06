import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleUnmetDemandRoutes, normalizeRestrictionKnowledgeBatch
} from '../src/unmet-demand-routes.mjs';

const HASH = 'a'.repeat(64);

test('輸入制限Knowledgeはハッシュ済み最小データだけを受け入れる', () => {
  const [record] = normalizeRestrictionKnowledgeBatch({ records: [{
    tenant: 'itg',
    source_order_hash: HASH,
    source_product_id: 'B000000001',
    restriction_class: 'lithium_battery',
    occurred_month: '2026-07',
    verification_level: 'HUMAN_REQUIRED'
  }] });
  assert.equal(record.restriction_class, 'LITHIUM_BATTERY');
  assert.equal(record.source_order_hash, HASH);
  assert.throws(() => normalizeRestrictionKnowledgeBatch({ records: [{
    tenant: 'itg', source_order_hash: HASH, restriction_class: 'LIQUID',
    occurred_month: '2026-07', order_id: 'raw-order'
  }] }), /RAW_ORDER_DATA_FORBIDDEN/);
});

test('高リスク代替商品は人手確認なしに登録できない', () => {
  assert.throws(() => normalizeRestrictionKnowledgeBatch({ records: [{
    tenant: 'itg', source_order_hash: HASH, restriction_class: 'LIQUID',
    occurred_month: '2026-07', verified_alternative_ids: ['B000000001']
  }] }), /HUMAN_VERIFICATION/);
});

test('輸入制限同期APIは専用Secretなしで拒否する', async () => {
  const response = await handleUnmetDemandRoutes(new Request(
    'https://hoshilu.app/api/internal/unmet-demand/sync',
    { method: 'POST', body: '{}' }
  ), { UNMET_DEMAND_SYNC_SECRET: 'x'.repeat(32) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNMET_DEMAND_UNAUTHORIZED');
});
