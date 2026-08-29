import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { safeMemberNotificationCopy, storeMemberNotificationDestination } from '../src/member-notification-delivery.mjs';

test('verified destinations are encrypted before storage', async()=>{
  let bound=[];
  const env={LINK_SIGNING_SECRET:'x'.repeat(40),PRODUCT_DB:{prepare(){return{bind(...values){bound=values;return this;},async run(){return{meta:{changes:1}};}};}}};
  await storeMemberNotificationDestination(env,'member-1','EMAIL','person@example.com');
  assert.equal(bound[0],'member-1');
  assert.equal(bound[1],'EMAIL');
  assert.notEqual(bound[2],'person@example.com');
  assert.doesNotMatch(bound[2],/person|example/);
});

test('SMS is excluded and app notifications use the service worker',async()=>{
  const [sales,app,worker]=await Promise.all([
    readFile(new URL('../src/marketplace-sales.mjs',import.meta.url),'utf8'),
    readFile(new URL('../public/app.js',import.meta.url),'utf8'),
    readFile(new URL('../public/service-worker.js',import.meta.url),'utf8')
  ]);
  assert.match(sales,/\['APP', 'LINE', 'EMAIL'\]/);
  assert.doesNotMatch(sales,/NOTIFICATION_DELIVERY_CHANNELS[^\n]+SMS/);
  assert.match(app,/Notification\.permission!=='granted'/);
  assert.match(app,/HOSHILU_NOTIFY/);
  assert.match(app,/url:safeNotificationDestination\(item\)/);
  assert.match(worker,/showNotification/);
  assert.match(worker,/notificationclick/);
  assert.match(worker,/existing\.navigate\(target\)/);
});

test('端末通知は安全なINSIGHT内部リンクを既存画面へnavigateし、新規画面でも同じURLを開く',async()=>{
  const worker=await readFile(new URL('../public/service-worker.js',import.meta.url),'utf8');
  const listeners={};let shown=null,navigated='',focused=0,opened='';
  const existing={url:'https://hoshilu.app/',async navigate(url){navigated=url;},async focus(){focused+=1;}};
  const clientsMock={
    async matchAll(){return[existing];},
    async openWindow(url){opened=url;return null;},
    async claim(){}
  };
  const context={
    URL,Promise,
    self:{
      location:{origin:'https://hoshilu.app'},
      registration:{async showNotification(title,options){shown={title,options};}},
      addEventListener(type,handler){listeners[type]=handler;},
      async skipWaiting(){},clients:clientsMock
    },
    clients:clientsMock,
    caches:{},
    fetch:async()=>new Response('')
  };
  runInNewContext(worker,context);
  const safe='/?search_watch=0123456789abcdef0123456789abcdef#hoshiluSearch';
  let pending;
  listeners.message({
    data:{type:'HOSHILU_NOTIFY',id:'n1',title:'新着',body:'見つかりました',url:safe},
    waitUntil(promise){pending=promise;}
  });
  await pending;
  assert.equal(shown.options.data.url,safe);

  let closed=false;
  listeners.notificationclick({
    notification:{data:{url:safe},close(){closed=true;}},
    waitUntil(promise){pending=promise;}
  });
  await pending;
  assert.equal(closed,true);
  assert.equal(navigated,safe);
  assert.equal(focused,1);

  clientsMock.matchAll=async()=>[];
  listeners.notificationclick({
    notification:{data:{url:safe},close(){}},
    waitUntil(promise){pending=promise;}
  });
  await pending;
  assert.equal(opened,safe);

  listeners.message({
    data:{type:'HOSHILU_NOTIFY',id:'n2',url:`/?search_watch=0123456789abcdef0123456789abcdef&q=${encodeURIComponent('白 長袖')}#hoshiluSearch`},
    waitUntil(promise){pending=promise;}
  });
  await pending;
  assert.equal(shown.options.data.url,'/#mywatchTitle');
});

test('LINE and email cannot be selected until a verified destination exists',async()=>{
  const [sales,client]=await Promise.all([
    readFile(new URL('../src/marketplace-sales.mjs',import.meta.url),'utf8'),
    readFile(new URL('../public/sale-center.mjs',import.meta.url),'utf8')
  ]);
  assert.match(sales,/availableDeliveryChannels\(env, member\.id\)/);
  assert.match(sales,/availableChannels\.includes\(value\)/);
  assert.match(sales,/available_delivery_channels: availableChannels/);
  assert.match(client,/input\.disabled=available instanceof Set&&!available\.has\(value\)/);
  assert.match(client,/availableDeliveryChannels=data\.available_delivery_channels\|\|\['APP'\]/);
});

test('browser members default to and retain an external notification destination',async()=>{
  const [sales,client]=await Promise.all([
    readFile(new URL('../src/marketplace-sales.mjs',import.meta.url),'utf8'),
    readFile(new URL('../public/sale-center.mjs',import.meta.url),'utf8')
  ]);
  assert.match(sales,/ensurePreference\(env, member\.id, availableChannels\)/);
  assert.match(sales,/initialChannels/);
  assert.match(client,/display-mode: standalone/);
  assert.match(client,/value==='LINE'\|\|value==='EMAIL'/);
  assert.match(client,/externalRequired/);
});

test('app members can combine app, LINE, and email notifications',async()=>{
  const [page,client]=await Promise.all([
    readFile(new URL('../public/index.html',import.meta.url),'utf8'),
    readFile(new URL('../public/sale-center.mjs',import.meta.url),'utf8')
  ]);
  assert.match(page,/通知方法：アプリ・LINE・メール/);
  assert.match(client,/SMSは使いません。/);
  assert.match(client,/SMS is not used\./);
  assert.match(client,/不使用短信。/);
  assert.match(client,/SMS는 사용하지 않습니다./);
});

test('login codes and member alerts share the approved HOSHILU sender',async()=>{
  const config=await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');
  assert.match(config,/"MEMBER_EMAIL_FROM": "notification@auth\.hoshilu\.app"/);
  assert.doesNotMatch(config,/login@auth\.hoshilu\.app/);
});

test('successful notification settings save closes the dialog',async()=>{
  const client=await readFile(new URL('../public/sale-center.mjs',import.meta.url),'utf8');
  assert.match(client,/settingsStatus\.textContent=.*\.saved;\s*settingsDialog\.close\(\)/s);
});

test('既にキューへ入った文字化け本文は送信前に安全な公式案内へ置き換える',()=>{
  const copy=safeMemberNotificationCopy('ABC-MARTのモール最新情報','��C�zM���A�ABC���\n\n公式ページを開く\nhttps://www.abc-mart.net/shop/');
  assert.equal(copy.title,'ABC-MARTのモール最新情報');
  assert.equal(copy.body,'公式ページで最新情報をご確認ください。\n\n公式ページを開く\nhttps://www.abc-mart.net/shop/');
  assert.equal(safeMemberNotificationCopy('正常な件名','正常な本文').body,'正常な本文');
});
