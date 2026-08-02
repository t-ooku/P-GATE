import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storeMemberNotificationDestination } from '../src/member-notification-delivery.mjs';

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
  assert.match(worker,/showNotification/);
  assert.match(worker,/notificationclick/);
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
  assert.match(client,/アプリ利用者もLINE・メールを追加でき/);
  assert.match(client,/App users can also add LINE and email/);
  assert.match(client,/应用用户也可以添加 LINE 和电子邮件/);
  assert.match(client,/앱 이용자도 LINE과 이메일을 추가/);
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
