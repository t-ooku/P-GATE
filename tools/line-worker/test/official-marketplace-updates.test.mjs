import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOfficialNotices, OFFICIAL_MARKETPLACE_SOURCES, syncOfficialMarketplaceUpdates } from '../src/official-marketplace-updates.mjs';

test('specific campaigns are extracted only from links on the official marketplace domain',()=>{
  const notices=extractOfficialNotices(`<a href="/campaign/summer/">夏のポイント10倍キャンペーン</a>
    <a href="https://evil.example/sale">偽のセール</a><a href="/help/">ヘルプ</a>`,'RAKUTEN_JP','楽天市場','https://event.rakuten.co.jp/');
  assert.equal(notices.length,1);
  assert.equal(notices[0].source_url,'https://event.rakuten.co.jp/campaign/summer/');
  assert.equal(notices[0].info_type,'EDITORIAL');
  assert.match(notices[0].sale_id,/^official-notice-RAKUTEN_JP-/);
});

test('ten official marketplace sources are collected without copying images',async()=>{
  const writes=[];
  const env={PRODUCT_DB:{prepare(sql){return{bind(...values){return{async run(){writes.push({sql,values});return{meta:{changes:1}};}};}};}}};
  const fetcher=async(url)=>new Response(
    '<html><head><title>最新キャンペーン | 公式</title><meta name="description" content="条件と期間を公式ページで確認できます。"></head></html>',
    {status:200,headers:{'content-type':'text/html'}}
  );
  const result=await syncOfficialMarketplaceUpdates(env,new Date('2026-08-02T03:00:00.000Z'),fetcher);
  assert.deepEqual(result,{checked:10,updated:10,failed:0});
  assert.equal(OFFICIAL_MARKETPLACE_SOURCES.length,10);
  assert.equal(writes.length,10);
  assert.deepEqual(new Set(writes.map(({values})=>values[1])).size,10);
  for(const {sql,values} of writes){
    assert.match(sql,/image_url,image_rights_status/);
    assert.match(sql,/'','NONE'/);
    assert.match(values[0],/^official-feed-/);
    assert.equal(values[2],'最新キャンペーン | 公式');
    assert.match(values[6],/^https:\/\//);
  }
});

test('failed official sources are omitted instead of publishing guesses',async()=>{
  let calls=0,writes=0;
  const env={PRODUCT_DB:{prepare(){return{bind(){return{async run(){writes+=1;return{meta:{changes:1}};}};}};}}};
  const fetcher=async()=>{calls+=1;return new Response('',{status:503});};
  const result=await syncOfficialMarketplaceUpdates(env,new Date('2026-08-02T03:00:00.000Z'),fetcher);
  assert.deepEqual(result,{checked:10,updated:0,failed:10});
  assert.equal(calls,10);
  assert.equal(writes,0);
});

test('official source list uses only HTTPS marketplace domains',()=>{
  for(const [, , value] of OFFICIAL_MARKETPLACE_SOURCES) assert.equal(new URL(value).protocol,'https:');
});
