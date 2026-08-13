import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAiRelatedQueries, relatedProductRecommendationQueries,
  resolveRelatedProductRecommendationQueries
} from '../src/related-product-recommendations.mjs';
import { validateRelatedRecommendationsRequest } from '../src/index.mjs';

test('スマホカバーから充電器・ストラップ等の別カテゴリへ横展開する',()=>{
  assert.deepEqual(relatedProductRecommendationQueries('iPhone用のスマホカバー').map(item=>item.query),['スマホ充電器','スマホストラップ','スマホ保護フィルム']);
});
test('顔用扇風機はQuery Expansion後に暑さ対策カテゴリへ展開する',()=>{
  assert.deepEqual(relatedProductRecommendationQueries('顔用扇風機').map(item=>item.query),['モバイルバッテリー','冷感タオル','ネッククーラー']);
});
test('ブランド名・度ありを含むカラコン検索はケア用品3カテゴリへ展開する',()=>{
  assert.deepEqual(
    relatedProductRecommendationQueries('LILY ANNA カラコン 度あり').map(item=>item.query),
    ['コンタクトレンズ洗浄液','コンタクトレンズケース','コンタクトレンズ装着液']
  );
});
test('主要カテゴリはカラコン以外も固定ルールで高速に横展開する',()=>{
  assert.deepEqual(relatedProductRecommendationQueries('ノートパソコン').map(item=>item.query),['ワイヤレスマウス','ノートパソコンケース','USB Type-C ハブ']);
  assert.deepEqual(relatedProductRecommendationQueries('炊飯器 5合').map(item=>item.query),['米びつ','米とぎボウル','キッチンスケール']);
  assert.deepEqual(relatedProductRecommendationQueries('ベビーカー 軽量').map(item=>item.query),['ベビーカー レインカバー','ベビーカーフック','ベビーカーシート']);
  assert.deepEqual(relatedProductRecommendationQueries('天然石 ピアス').map(item=>item.query),['アクセサリーケース','ピアスキャッチ','ジュエリークロス']);
});
test('固定ルールにないカテゴリは同期判定では創作しない',()=>assert.deepEqual(relatedProductRecommendationQueries('未知の商品XYZ'),[]));

test('LB 3in1 アイブロウは眉メイクの関連商品カテゴリを返す',()=>assert.deepEqual(
  relatedProductRecommendationQueries('LB 3in1 アイブロウ').map(item=>item.query),
  ['アイブロウブラシ','眉マスカラ','アイブロウコート']
));

test('固定ルールにない検索はAIが理解した別カテゴリへ横展開できる',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),body:String(options?.body||'')});
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({categories:[
      {query:'収納ボックス',reason:'小物の整理に関連'},
      {query:'ラベルシール',reason:'収納物の分類に関連'},
      {query:'棚用滑り止めシート',reason:'収納場所の安定に関連'}
    ]})}]}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await resolveRelatedProductRecommendationQueries('アクセサリー収納棚','JA',{GEMINI_API_KEY:'g'.repeat(20)},fetchImpl);
  assert.deepEqual(result.map(item=>item.query),['収納ボックス','ラベルシール','棚用滑り止めシート']);
  assert.equal(calls.length,1);
  assert.match(calls[0].body,/complementary-product category planner/);
});

test('AI提案は重複・元商品・URL・理由なしを除外する',()=>{
  assert.deepEqual(normalizeAiRelatedQueries({categories:[
    {query:'炊飯器',reason:'元商品'},
    {query:'米びつ',reason:'保存に関連'},
    {query:'米びつ',reason:'重複'},
    {query:'https://example.com',reason:'URL'},
    {query:'睡眠サプリ',reason:'安全対象外'},
    {query:'計量カップ',reason:''},
    {query:'しゃもじ',reason:'盛り付けに関連'}
  ]},'炊飯器'),[
    {query:'米びつ',reason:'保存に関連'},
    {query:'しゃもじ',reason:'盛り付けに関連'}
  ]);
});

test('検索した商品そのものは固定ルールの関連商品へ再掲しない',()=>{
  assert.deepEqual(relatedProductRecommendationQueries('テレビ台').map(item=>item.query),['HDMIケーブル','画面クリーナー']);
  assert.deepEqual(relatedProductRecommendationQueries('ベビーカーフック').map(item=>item.query),['ベビーカー レインカバー','ベビーカーシート']);
});

test('医薬品など安全性の高い検索はAI自動補完しない',async()=>{
  let called=false;
  const result=await resolveRelatedProductRecommendationQueries('処方薬 花粉症','JA',{GEMINI_API_KEY:'g'.repeat(20)},async()=>{called=true;throw new Error('should not call');});
  assert.deepEqual(result,[]);
  assert.equal(called,false);
});

test('関連商品APIも本検索と同じ同意・session・Turnstile境界を使う',()=>{
  assert.equal(validateRelatedRecommendationsRequest({query:'スマホカバー',consent:true,session_id:'anonymous_session_123456',turnstile_token:'token',language:'JA'}).query,'スマホカバー');
  assert.throws(()=>validateRelatedRecommendationsRequest({query:'スマホカバー',consent:false,session_id:'anonymous_session_123456',turnstile_token:'token'}),/CONSENT_REQUIRED/);
});
