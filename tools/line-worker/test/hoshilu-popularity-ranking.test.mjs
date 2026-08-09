import test from 'node:test';
import assert from 'node:assert/strict';
import { rankHoshiluPopularity, scoreHoshiluPopularity, selectSponsorSlots } from '../src/hoshilu-popularity-ranking.mjs';
import { popularitySignalsForObservedCandidate } from '../src/index.mjs';

test('API連携有無を加点せず観測できた人気・口コミ・需要等だけで総合点を算出する', () => {
  const result = scoreHoshiluPopularity({ popularity_signals:{ marketplace_popularity:1, review_confidence:.8, marketplace_coverage:.6, price_competitiveness:.7, hoshilu_demand:.9, freshness:1 } });
  assert.equal(result.confidence,100); assert.ok(result.score>80);
  assert.equal('api_connected' in result.breakdown,false);
});

test('API未連携モールも正規に観測した商品オファーがあれば候補根拠へ含める', () => {
  const signals = popularitySignalsForObservedCandidate({
    marketplace_source: 'D1_INDEX',
    offers: [
      { marketplace: 'LOFT_JP', price: 2000 },
      { marketplace: 'HANDS_JP', price: 2100 }
    ]
  }, 0, 1, { low: 1000, high: 3000 });
  assert.equal(signals.marketplace_popularity, null);
  assert.equal(signals.marketplace_coverage, 2 / 3);
  assert.equal(signals.price_competitiveness, 0.5);
});

test('根拠が少ない商品は満点換算で1位にせずconfidenceで抑制する', () => {
  const sparse=scoreHoshiluPopularity({popularity_signals:{marketplace_popularity:1}});
  assert.equal(sparse.confidence,25); assert.equal(sparse.score,25);
  const ranked=rankHoshiluPopularity([{id:'sparse',popularity_signals:{marketplace_popularity:1}},{id:'grounded',popularity_signals:{marketplace_popularity:.7,review_confidence:.7,marketplace_coverage:.7}}]);
  assert.deepEqual(ranked.map(item=>item.id),['grounded']);
});

test('スポンサーは自然順位と別配列で最大3枠・同一広告主1枠・30分ごとに流動表示する', () => {
  const campaigns=[1,2,3,4,5].map((id)=>({campaign_id:`c${id}`,advertiser_id:id<3?'same':`a${id}`,category_id:'fan',active:true,remaining_budget_jpy:1000,intent_eligible:true}));
  const slots=selectSponsorSlots(campaigns,'fan',new Date('2026-08-09T08:00:00Z'));
  assert.equal(slots.length,3); assert.equal(new Set(slots.map(item=>item.advertiser_id)).size,3);
  assert.ok(slots.every(item=>item.result_type==='SPONSORED'&&item.disclosure==='広告・PR'));
  assert.notDeepEqual(slots.map(item=>item.campaign_id),selectSponsorSlots(campaigns,'fan',new Date('2026-08-09T09:00:00Z')).map(item=>item.campaign_id));
});
