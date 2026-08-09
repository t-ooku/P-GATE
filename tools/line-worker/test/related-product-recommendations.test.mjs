import test from 'node:test';
import assert from 'node:assert/strict';
import { relatedProductRecommendationQueries } from '../src/related-product-recommendations.mjs';
import { validateRelatedRecommendationsRequest } from '../src/index.mjs';

test('スマホカバーから充電器・ストラップ等の別カテゴリへ横展開する',()=>{
  assert.deepEqual(relatedProductRecommendationQueries('iPhone用のスマホカバー').map(item=>item.query),['スマホ充電器','スマホストラップ','スマホ保護フィルム']);
});
test('顔用扇風機はQuery Expansion後に暑さ対策カテゴリへ展開する',()=>{
  assert.deepEqual(relatedProductRecommendationQueries('顔用扇風機').map(item=>item.query),['モバイルバッテリー','冷感タオル','ネッククーラー']);
});
test('根拠のないカテゴリでは関連商品を創作しない',()=>assert.deepEqual(relatedProductRecommendationQueries('未知の商品XYZ'),[]));

test('関連商品APIも本検索と同じ同意・session・Turnstile境界を使う',()=>{
  assert.equal(validateRelatedRecommendationsRequest({query:'スマホカバー',consent:true,session_id:'anonymous_session_123456',turnstile_token:'token',language:'JA'}).query,'スマホカバー');
  assert.throws(()=>validateRelatedRecommendationsRequest({query:'スマホカバー',consent:false,session_id:'anonymous_session_123456',turnstile_token:'token'}),/CONSENT_REQUIRED/);
});
