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
