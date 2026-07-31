import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFoodDeliveryDestinations,
  isFoodDeliverySearch
} from '../src/food-delivery-marketplaces.mjs';

test('food intent exposes only official delivery destinations', () => {
  assert.equal(isFoodDeliverySearch('今日の夕食をデリバリーしたい'), true);
  assert.deepEqual(buildFoodDeliveryDestinations('ピザを食べたい').map(item => item.marketplace), [
    'UBER_EATS_JP', 'DEMAE_CAN_JP', 'MENU_JP', 'ROCKET_NOW_JP'
  ]);
  for (const item of buildFoodDeliveryDestinations('ランチ')) {
    assert.equal(new URL(item.destination).protocol, 'https:');
  }
});

test('food delivery destinations do not leak into ordinary product search', () => {
  assert.deepEqual(buildFoodDeliveryDestinations('USB充電プリンター'), []);
});
