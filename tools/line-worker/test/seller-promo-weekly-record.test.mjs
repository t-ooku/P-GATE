import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWeeklyRecord, jstDate } from '../scripts/seller-promo-weekly-record.mjs';

test('§10 週次の記録: job・納品物の状態と検査理由・要確認・原価だけを書き、本文は書かない', () => {
  const now = new Date('2026-10-04T22:07:00Z'); // 月曜 07:07 JST
  assert.equal(jstDate(now), '2026-10-05');
  const md = formatWeeklyRecord({
    weekKey: '2026-W41', now,
    jobs: [{ seller_key: 'qa-shop-1', status: 'DONE', attempt: 1, error: 'IMAGE_SKIPPED_NO_R2', started_at: 'a', finished_at: 'b' }],
    deliverables: [
      { seller_key: 'qa-shop-1', type: 'ARTICLE', version: 1, status: 'QA_FAILED', qa: JSON.stringify({ reasons: [{ code: 'FORBIDDEN_EXPRESSION', detail: '商品データ' }] }), payload: '本文は渡されても書かない' },
      { seller_key: 'qa-shop-1', type: 'ARTICLE', version: 2, status: 'QA_PASSED', qa: JSON.stringify({ reasons: [], notes: [{ code: 'PROPERTY_CLAIM_UNVERIFIED', detail: '丈夫' }] }) }
    ],
    usage: [{ seller_key: 'qa-shop-1', calls: 4, input_tokens: 4000, output_tokens: 3000, cost_jpy: 2.1 }]
  });
  assert.match(md, /^## 2026-W41（記録 2026-10-05 07:07 JST、自動）/u);
  assert.match(md, /\| qa-shop-1 \| DONE \| 1 \| IMAGE_SKIPPED_NO_R2 \|/u);
  assert.match(md, /\| qa-shop-1 \| ARTICLE \| 1 \| QA_FAILED \| FORBIDDEN_EXPRESSION:商品データ \| — \|/u);
  assert.match(md, /\| qa-shop-1 \| ARTICLE \| 2 \| QA_PASSED \| — \| PROPERTY_CLAIM_UNVERIFIED:丈夫 \|/u);
  assert.match(md, /\| qa-shop-1 \| 4 \| 4000 \| 3000 \| 2\.1 \|/u);
  assert.match(md, /まとめ: job 1 件（DONE 以外 0）・納品物 2 版（QA_FAILED 1・要確認 1）。/u);
  assert.doesNotMatch(md, /本文は渡されても書かない/u);
  assert.match(formatWeeklyRecord({ weekKey: '2026-W41', now, jobs: [] }), /今週の job はまだありません/u);
});
