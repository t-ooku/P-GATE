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

test('§3-4 週次の記録に自社投稿の反応を 1 行（取れない数は「—」）', async () => {
  const { formatReactionLine } = await import('../scripts/seller-promo-weekly-record.mjs');
  assert.equal(formatReactionLine({ published: 5, impressions: 1200, lpViews: 30, ctaClicks: 4, inquiries: 1 }),
    '投稿の反応（直近7日・hoshilu-seller-daily-v1）: 公開 5 本・表示 1200・LP 閲覧 30・LP のボタン 4・相談 1（相談は経路を問わない全件）');
  assert.match(formatReactionLine({ published: 0 }), /公開 0 本・表示 —・LP 閲覧 —/u);
  const md = formatWeeklyRecord({ weekKey: '2026-W41', now: new Date('2026-10-04T22:07:00Z'), jobs: [], reaction: { published: 1 } });
  assert.match(md, /投稿の反応（直近7日/u);
});
