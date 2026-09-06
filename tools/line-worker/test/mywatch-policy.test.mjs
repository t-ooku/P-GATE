import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWatchEvent, wishAcceptsEvent, nextDeliveryAt, retryAt,
  notificationCopy
} from '../src/mywatch-policy.mjs';

test('MYWATCHイベントを検証して重複排除キーを保持する', () => {
  const event = normalizeWatchEvent({
    event_key: 'price:B000000001:20260725',
    event_type: 'price_drop',
    asin: 'b000000001',
    title: '対象商品'
  });
  assert.equal(event.event_type, 'PRICE_DROP');
  assert.equal(event.asin, 'B000000001');
  assert.throws(() => normalizeWatchEvent({ event_key: 'short', event_type: 'PRICE_DROP' }));
});

test('会員が選んだ通知種別とミュートを尊重する', () => {
  assert.equal(wishAcceptsEvent({ watch_price: 1, watch_frequency: 'INSTANT' }, { event_type: 'PRICE_DROP' }), true);
  assert.equal(wishAcceptsEvent({ watch_price: 0, watch_frequency: 'INSTANT' }, { event_type: 'PRICE_DROP' }), false);
  assert.equal(wishAcceptsEvent({ watch_price: 1, watch_frequency: 'MUTED' }, { event_type: 'PRICE_DROP' }), false);
});

test('日次・週次配信と指数バックオフを決定論的に計算する', () => {
  const now = new Date('2026-07-25T10:00:00.000Z');
  assert.equal(nextDeliveryAt('DAILY', now), '2026-07-26T00:00:00.000Z');
  assert.equal(nextDeliveryAt('WEEKLY', now), '2026-08-01T00:00:00.000Z');
  assert.equal(retryAt(2, now), '2026-07-25T10:20:00.000Z');
});

test('通知理由を4言語で生成する', () => {
  const event = { event_type: 'RESTOCK', title: 'Camera', detail: 'wish条件に一致' };
  assert.match(notificationCopy(event, 'JA').title, /再入荷/);
  assert.match(notificationCopy(event, 'EN').title, /stock/i);
  assert.match(notificationCopy(event, 'ZH').title, /补货/);
  assert.match(notificationCopy(event, 'KO').title, /재입고/);
});
