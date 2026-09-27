import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SELLER_OPTIONS, BASE_MONTHLY_QUOTA_TARGET, findSellerOption, optionSaleState,
  publicOptionCatalog, monthlyQuota, optionConsentValid
} from '../src/seller-options.mjs';

// 2026-09-28 統合実行指示書 §15・§16・T06: 未承認のオプションは販売 OFF。金額は公開リポジトリに書かない。

const approvedEnv = (overrides = {}) => ({
  SELLER_OPTIONS_SALES_ENABLED: 'true',
  SELLER_PILOT_PAYMENT_MODE: 'test',
  SELLER_OPTION_TRAFFIC_BOOST_APPROVED: 'true',
  SELLER_OPTION_TRAFFIC_BOOST_PROVIDED: 'true',
  SELLER_OPTION_TRAFFIC_BOOST_PRICE_JPY: '1234', // テスト用のダミー値（実際の金額案ではない）
  SELLER_OPTION_TRAFFIC_BOOST_TEST_PRICE_ID: 'price_TESTdummy',
  ...overrides
});

test('既定ではすべて販売 OFF（T06）', () => {
  for (const option of SELLER_OPTIONS) {
    const state = optionSaleState(option, {});
    assert.equal(state.sellable, false, option.id);
    assert.ok(state.reasons.includes('SALES_SWITCH_OFF'));
    assert.ok(state.reasons.includes('PRICE_NOT_APPROVED'));
  }
  assert.deepEqual(publicOptionCatalog({}), []);
});

test('承認・提供確認・金額・Price ID・全体スイッチがそろったものだけ販売できる', () => {
  const traffic = findSellerOption('traffic-boost');
  assert.equal(optionSaleState(traffic, approvedEnv()).sellable, true);
  for (const missing of ['SELLER_OPTIONS_SALES_ENABLED', 'SELLER_OPTION_TRAFFIC_BOOST_APPROVED', 'SELLER_OPTION_TRAFFIC_BOOST_PROVIDED', 'SELLER_OPTION_TRAFFIC_BOOST_PRICE_JPY', 'SELLER_OPTION_TRAFFIC_BOOST_TEST_PRICE_ID']) {
    assert.equal(optionSaleState(traffic, approvedEnv({ [missing]: '' })).sellable, false, missing);
  }
  // live モードでは LIVE の Price ID が要る（テスト用 ID で本番販売しない）
  assert.equal(optionSaleState(traffic, approvedEnv({ SELLER_PILOT_PAYMENT_MODE: 'live' })).sellable, false);
  // 他のオプションは承認されていないので出さない
  const catalog = publicOptionCatalog(approvedEnv());
  assert.deepEqual(catalog.map((item) => item.id), ['traffic-boost']);
  assert.equal(catalog[0].amount_jpy, 1234);
});

test('基本の同意（カード登録・自動更新）をオプション購入の同意に流用しない', () => {
  const traffic = findSellerOption('traffic-boost');
  const env = approvedEnv();
  const good = { scope: 'seller_option', accepted: true, option_id: 'traffic-boost', option_version: traffic.version, kind: 'monthly', amount_jpy: 1234, accepted_at: '2026-09-28T00:00:00Z' };
  assert.equal(optionConsentValid(good, traffic, env), true);
  assert.equal(optionConsentValid({ ...good, scope: 'seller_autorenew' }, traffic, env), false, '基本契約の同意');
  assert.equal(optionConsentValid({ ...good, amount_jpy: 999 }, traffic, env), false, '示した金額と違う');
  assert.equal(optionConsentValid({ ...good, option_version: 'old' }, traffic, env), false, '版が違う');
  assert.equal(optionConsentValid({ ...good, accepted: false }, traffic, env), false);
  assert.equal(optionConsentValid(good, traffic, {}), false, '販売 OFF なら同意があっても無効');
});

test('枠は基本＋有効な月額オプション。重複は1回、種別違いは数えない（T08）', () => {
  assert.deepEqual(monthlyQuota(), { ...BASE_MONTHLY_QUOTA_TARGET });
  const boosted = monthlyQuota({ activeMonthlyOptionIds: ['traffic-boost', 'traffic-boost'] });
  assert.equal(boosted.seo_articles, 4);
  assert.equal(boosted.sns_posts, 8);
  const wrongKind = monthlyQuota({ activeMonthlyOptionIds: ['feature-page'] });
  assert.equal(wrongKind.feature_pages, 0, '単発を月額として数えない');
  const feature = monthlyQuota({ oneTimeOptionIds: ['feature-page'] });
  assert.equal(feature.feature_pages, 1);
  assert.equal(monthlyQuota({ activeMonthlyOptionIds: ['unknown'] }).seo_articles, 2);
});

test('公開リポジトリに未承認の金額を書かない（§19-3）', () => {
  const source = readFileSync(new URL('../src/seller-options.mjs', import.meta.url), 'utf8');
  const amounts = source.match(/[0-9][0-9,]*円/gu) || [];
  assert.deepEqual(amounts.filter((amount) => amount !== '1,980円'), []);
});
