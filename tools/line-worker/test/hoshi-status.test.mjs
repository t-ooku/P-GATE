import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 2026-09-15 指示書 §8/§9「ホシってるもの」: 預けている「欲しい」を
// 探しています／見つかりました／値下がり待ち／あとで見る の4状態に分ける。
// 数字は会員の実データ(memberWishRecords / memberNotifications)だけから数える。
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('const hoshiStatusCopy='),app.indexOf('function renderHoshiStatus()'));
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

function counts({wishes,records,notifications}){
  const context=vm.createContext({
    getWishes:()=>wishes,
    memberNotifications:notifications,
    recordFor:query=>records.find(item=>item.query_text===query),
    insightEnabledFor:query=>{const r=records.find(item=>item.query_text===query);return Boolean(r?.notify_new_match)&&Boolean(r?.insight_enabled_at)&&String(r?.watch_frequency||'MUTED')!=='MUTED';}
  });
  vm.runInContext(source,context);
  return JSON.parse(vm.runInContext('JSON.stringify(hoshiStatusCounts())',context));
}

test('4状態の振り分け: 見つかりました > 値下がり待ち > 探しています > あとで見る',()=>{
  const records=[
    {wish_id:'w1',query_text:'封筒',notify_new_match:1,insight_enabled_at:'2026-09-04T00:00:00Z',watch_frequency:'INSTANT'},
    {wish_id:'w2',query_text:'トート',target_price_jpy:3000},
    {wish_id:'w3',query_text:'Tシャツ',notify_new_match:1,insight_enabled_at:'2026-09-08T00:00:00Z',watch_frequency:'INSTANT'},
    {wish_id:'w4',query_text:'ミュート',notify_new_match:1,insight_enabled_at:'2026-09-08T00:00:00Z',watch_frequency:'MUTED'}
  ];
  const notifications=[
    {wish_id:'w1',event_type:'INSIGHT_NEW_MATCH',read_at:null},
    {wish_id:'w3',event_type:'INSIGHT_NEW_MATCH',read_at:'2026-09-09T00:00:00Z'},
    {wish_id:'w2',event_type:'SALE',read_at:null}
  ];
  const result=counts({wishes:['封筒','トート','Tシャツ','ミュート','端末だけ'],records,notifications});
  assert.deepEqual(result,{searching:1,found:1,waiting:1,later:2});
});

test('未ログイン(記録なし)は全件「あとで見る」、通知が無ければ「見つかりました」は0',()=>{
  assert.deepEqual(counts({wishes:['a','b'],records:[],notifications:[]}),{searching:0,found:0,waiting:0,later:2});
  assert.deepEqual(counts({wishes:[],records:[],notifications:[]}),{searching:0,found:0,waiting:0,later:0});
});

test('希望価格到達(PRICE_DROP)の未読通知は「見つかりました」に入る',()=>{
  const records=[{wish_id:'w2',query_text:'トート',target_price_jpy:3000}];
  assert.deepEqual(counts({wishes:['トート'],records,notifications:[{wish_id:'w2',event_type:'PRICE_DROP',read_at:null}]}),{searching:0,found:1,waiting:0,later:0});
});

test('トップの保存ハブは「ホシってるもの」を見出しにし、4状態の枠を持つ',()=>{
  assert.match(html,/<h2 id="insightTitle">ホシってるもの<\/h2>/);
  assert.match(html,/<div id="hoshiStatus" class="hoshi-status"/);
  assert.ok(html.includes('href="/mywatch.css?v=4"'));
  assert.ok(html.includes('src="/assets-v147/app.js?v=175"'));
  assert.equal(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),readFileSync(new URL('../public/assets-v147/app.js',import.meta.url),'utf8'));
});
