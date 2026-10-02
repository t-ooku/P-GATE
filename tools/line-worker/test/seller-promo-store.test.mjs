import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePromoProfile, productsFromCsv, parseCsv, maskPii, normalizeQuestionItems, promoWeekKey, jstMonthRange, upsertPromoProfile,
  importPromoProducts, addPromoQuestions, promoMonthKey
} from '../src/seller-promo-store.mjs';
import { encryptPromoSecret, decryptPromoSecret, connectionAad, promoKekConfigured } from '../src/seller-promo-crypto.mjs';
import { promoDb, promoEnv, TEST_KEK } from './helpers/seller-promo-fixture.mjs';

test('禁止カテゴリ（化粧品・健康食品・食品・医療機器）を含むプロファイルは拒否し、対象カテゴリだけ通す', () => {
  for (const bad of ['化粧品', 'サプリメント', '食品', '医療機器', 'コスメ'])
    assert.throws(() => normalizePromoProfile({ seller_key: 'shop-1', categories: ['生活雑貨', bad] }), /CATEGORY_NOT_ALLOWED/);
  assert.throws(() => normalizePromoProfile({ seller_key: 'shop-1', categories: ['家電'] }), /CATEGORY_NOT_ALLOWED/);
  assert.throws(() => normalizePromoProfile({ seller_key: 'shop-1', categories: [] }), /CATEGORIES_REQUIRED/);
  const ok = normalizePromoProfile({ seller_key: 'shop-1', categories: ['ペット', 'バッグ'], plan: 'standard' });
  assert.equal(ok.plan, 'STANDARD');
  assert.deepEqual(ok.categories, ['ペット', 'バッグ']);
  assert.equal(ok.weekday, 1);
  assert.equal(ok.hour_jst, 6);
});

test('楽天の標準列名を第一候補に CSV を読み、価格を推測しない', () => {
  const csv = '﻿商品管理番号（商品URL）,商品名,販売価格,商品画像パス1,素材\r\nbox-1,"収納ボックス, 大",2980,https://example.com/a.jpg,綿\r\nbox-2,"説明に""引用""",価格未定,http://insecure.example.com/b.jpg,\r\n';
  const items = productsFromCsv(csv);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { external_id: 'box-1', name: '収納ボックス, 大', price_jpy: 2980, url: '', image_url: 'https://example.com/a.jpg', attrs: { 素材: '綿' } });
  assert.equal(items[1].name, '説明に"引用"');
  assert.equal(items[1].price_jpy, null);
  assert.equal(items[1].image_url, '');
  assert.equal(parseCsv('a,b\n"x\ny",z\n')[1][0], 'x\ny');
});

test('商品名の列が見つからなければ見出しを返してマッピングを求め、明示マッピングで読める', () => {
  const csv = '品目,値段\nかご,1200\n';
  assert.throws(() => productsFromCsv(csv), (error) => error.message === 'CSV_MAPPING_REQUIRED' && error.headers.includes('品目'));
  const items = productsFromCsv(csv, { name: '品目', price_jpy: '値段' });
  assert.equal(items[0].name, 'かご');
  assert.equal(items[0].price_jpy, 1200);
});

test('疑問: FORM は PII を伏せ、FEEDBACK_API は集計のみ、HOSHILU_DEMAND は手入力不可、300 字まで', () => {
  const [item] = normalizeQuestionItems([{ source: 'FORM', text: '連絡は taro@example.com か 090-1234-5678、〒150-0001 です' }]);
  assert.doesNotMatch(item.text, /taro@|090-1234|150-0001/);
  assert.match(item.text, /［メール］/);
  assert.throws(() => normalizeQuestionItems([{ source: 'FEEDBACK_API', text: '要約' }]), /FEEDBACK_AGGREGATE_ONLY/);
  assert.equal(normalizeQuestionItems([{ source: 'FEEDBACK_API', text: '要約', aggregate: true }]).length, 1);
  assert.throws(() => normalizeQuestionItems([{ source: 'HOSHILU_DEMAND', text: 'x' }]), /SERVER_ONLY/);
  assert.equal(normalizeQuestionItems([{ source: 'STORE_PASTE', text: 'あ'.repeat(500) }])[0].text.length, 300);
  assert.equal(maskPii('https://evil.example/x を見て'), '［URL］ を見て');
});

test('週・月の区切りは JST', () => {
  assert.equal(promoWeekKey(new Date('2026-10-04T21:05:00Z')), '2026-W41'); // 月曜 06:05 JST
  assert.equal(promoWeekKey(new Date('2026-10-04T14:00:00Z')), '2026-W40'); // 日曜 23:00 JST
  assert.equal(promoWeekKey(new Date('2027-01-01T00:00:00Z')), '2026-W53');
  assert.equal(promoMonthKey(new Date('2026-10-31T15:30:00Z')), '2026-11');
  assert.deepEqual(jstMonthRange('2026-10'), { from: '2026-09-30T15:00:00.000Z', to: '2026-10-31T15:00:00.000Z' });
});

test('商品の取り込みは同じ内容なら更新せず、監査を残す。疑問は重複しない', async () => {
  const { db, adapter } = promoDb();
  await upsertPromoProfile(adapter, { seller_key: 'shop-1', categories: ['文具'] });
  const item = { external_id: 'p1', name: 'ペン', price_jpy: 300, url: '', image_url: '', attrs: {} };
  assert.deepEqual(await importPromoProducts(adapter, 'shop-1', 'CSV', [item]), { imported: 1, unchanged: 0 });
  assert.deepEqual(await importPromoProducts(adapter, 'shop-1', 'CSV', [item]), { imported: 0, unchanged: 1 });
  await importPromoProducts(adapter, 'shop-1', 'CSV', [{ ...item, price_jpy: 350 }]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM seller_promo_products').get().n, 1);
  assert.equal(db.prepare('SELECT price_jpy FROM seller_promo_products').get().price_jpy, 350);
  const q = [{ source: 'STORE_PASTE', text: 'インクは替えられますか', product_ref: 'p1', weight: 1, period_from: '', period_to: '' }];
  assert.deepEqual(await addPromoQuestions(adapter, 'shop-1', q), { added: 1, duplicate: 0 });
  assert.deepEqual(await addPromoQuestions(adapter, 'shop-1', q), { added: 0, duplicate: 1 });
  const actions = db.prepare('SELECT action FROM seller_promo_audit ORDER BY created_at').all().map((r) => r.action);
  assert.ok(actions.includes('PROFILE_UPSERT') && actions.includes('PRODUCTS_IMPORT') && actions.includes('QUESTIONS_ADD'));
});

test('接続秘密は AES-GCM。別の店・別の鍵では復号できない', async () => {
  const env = promoEnv(null);
  assert.equal(promoKekConfigured(env), true);
  assert.equal(promoKekConfigured({ SELLER_PROMO_KEK: 'short' }), false);
  const sealed = await encryptPromoSecret(env, 'abcd efgh ijkl mnop', connectionAad('shop-1', 'WORDPRESS'));
  assert.doesNotMatch(sealed.secret_enc, /abcd/);
  assert.equal(await decryptPromoSecret(env, sealed, connectionAad('shop-1', 'WORDPRESS')), 'abcd efgh ijkl mnop');
  await assert.rejects(decryptPromoSecret(env, sealed, connectionAad('shop-2', 'WORDPRESS')), /UNREADABLE/);
  await assert.rejects(decryptPromoSecret({ SELLER_PROMO_KEK: 'b'.repeat(64) }, sealed, connectionAad('shop-1', 'WORDPRESS')), /UNREADABLE/);
  await assert.rejects(encryptPromoSecret({}, 'x', 'y'), /KEK_NOT_CONFIGURED/);
  assert.equal(TEST_KEK.length, 64);
});
