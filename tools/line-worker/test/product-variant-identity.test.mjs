import test from 'node:test';
import assert from 'node:assert/strict';
import { variantAttributes, compareVariants, MULTIPLE } from '../src/product-variant-identity.mjs';
import { matchProductIdentity } from '../src/product-identity-matching.mjs';
import { normalizeOffer } from '../src/hoshilu-product-schema.mjs';

// 実際の商品名（D1 price_observations 2026-11-14 から。Cowork 依頼 P3）
const BASE_04 = 'ロムアンド グラスティングカラーグロス 04 4g';
const BASE_04_ALT = 'ロムアンド グラスティング カラー グロス 04(4g)【ロムアンド】';
const S04 = 'rom&nd グラスティングカラーグロス S04 4g';
const MINI_TRIO_02 = 'ロムアンド グラスティングカラーグロス ミニトリオ 02 ブルべ';
const PARALLEL_04 = '【日本語パッケージ】【並行輸入品】… グラスティングカラーグロス 04 Grapy Way 4.';
const ALL_COLORS = 'グラスティングカラーグロス 全6色 rom&nd …';
const CHOICE_4 = '【選べる4種】ROMAND ロムアンド グラスティングカラーグロス 4g (03/04/05/06)';
const LIST_3 = 'rom&nd ロムアンド グラスティングカラーグロス 01・04・05';

test('同じ: 04 4g と 04(4g)【ロムアンド】は same', () => {
  assert.equal(compareVariants(BASE_04, BASE_04_ALT), 'same');
  assert.equal(compareVariants(BASE_04_ALT, BASE_04), 'same');
});

test('別: 04 と S04 は different', () => {
  assert.equal(compareVariants(BASE_04, S04), 'different');
});

test('別: 04 と ミニトリオ 02 は different', () => {
  assert.equal(compareVariants(BASE_04, MINI_TRIO_02), 'different');
});

test('別: 04 と 並行輸入品の 04 は different', () => {
  assert.equal(compareVariants(BASE_04, PARALLEL_04), 'different');
});

test('未確認: 全6色（色番なし）は unconfirmed', () => {
  assert.equal(compareVariants(BASE_04, ALL_COLORS), 'unconfirmed');
});

test('未確認: 選べる4種 (03/04/05/06) は unconfirmed', () => {
  assert.equal(compareVariants(BASE_04, CHOICE_4), 'unconfirmed');
});

test('未確認: 01・04・05（色が複数）は unconfirmed', () => {
  assert.equal(compareVariants(BASE_04, LIST_3), 'unconfirmed');
});

test('unconfirmed 同士も same に寄せない', () => {
  assert.equal(compareVariants(LIST_3, LIST_3), 'unconfirmed');
  assert.equal(compareVariants(ALL_COLORS, CHOICE_4), 'unconfirmed');
});

test('variantAttributes: 色番・容量・状態を取り出し、書いていないものは null', () => {
  assert.deepEqual(variantAttributes(BASE_04), {
    color: '04', capacity: '4g', pack_count: null, refill: null, size_class: null, set_type: null, condition: null
  });
  assert.equal(variantAttributes(S04).color, 'S04');
  assert.equal(variantAttributes('グロス #04').color, '#04');
  assert.equal(variantAttributes(LIST_3).color, MULTIPLE);
  assert.equal(variantAttributes(CHOICE_4).color, MULTIPLE);
  assert.equal(variantAttributes(ALL_COLORS).color, MULTIPLE);
  assert.equal(variantAttributes(PARALLEL_04).condition, 'parallel_import');
  assert.equal(variantAttributes(PARALLEL_04).capacity, null, '「4.」は単位がないので容量にしない');
  const mini = variantAttributes(MINI_TRIO_02);
  assert.equal(mini.size_class, 'mini');
  assert.equal(mini.set_type, 'set');
  assert.equal(mini.color, '02');
});

test('#04・04・S04 は別の表記として扱い、same にしない', () => {
  assert.notEqual(compareVariants('グロス #04 4g', 'グロス 04 4g'), 'same');
  assert.equal(compareVariants('グロス 04 4g', 'グロス S04 4g'), 'different');
  assert.equal(compareVariants('グロス #04 4g', 'グロス #04 4g'), 'same');
});

test('容量: 4g と 4.0g は同じ、4g と 8g は別、50ml を読む', () => {
  assert.equal(variantAttributes('グロス 04 4.0g').capacity, '4g');
  assert.equal(compareVariants('グロス 04 4g', 'グロス 04 4.0g'), 'same');
  assert.equal(compareVariants('グロス 04 4g', 'グロス 04 8g'), 'different');
  assert.equal(variantAttributes('化粧水 50ml').capacity, '50ml');
});

test('入り数: 3本セット・×2 を読み、片方だけなら unconfirmed、食い違えば different', () => {
  assert.equal(variantAttributes('リップ 04 3本セット').pack_count, 3);
  assert.equal(variantAttributes('化粧水 50ml×2').pack_count, 2);
  assert.equal(compareVariants('リップ 04 3本セット', 'リップ 04'), 'unconfirmed');
  assert.equal(compareVariants('化粧水 05 50ml×2', '化粧水 05 50ml×3'), 'different');
  assert.equal(variantAttributes('ラグ 30×40cm').pack_count, null, '寸法は入り数にしない');
});

test('本体/詰替: 詰替は本体や無記載と別', () => {
  assert.equal(variantAttributes('シャンプー 詰め替え 400ml').refill, 'refill');
  assert.equal(variantAttributes('シャンプー 本体 400ml').refill, 'body');
  assert.equal(compareVariants('シャンプー 本体 400ml', 'シャンプー 詰め替え 400ml'), 'different');
  assert.equal(compareVariants('シャンプー 400ml', 'シャンプー 詰替 400ml'), 'different');
});

test('通常/ミニ: mini・ミニ を読み、片方だけなら different', () => {
  assert.equal(variantAttributes('グロス mini 04').size_class, 'mini');
  assert.equal(compareVariants('グロス 04 4g', 'グロス ミニ 04'), 'different');
});

test('商品状態: 訳あり・中古・アウトレットを読む', () => {
  assert.equal(variantAttributes('【訳あり】グロス 04').condition, 'bargain');
  assert.equal(variantAttributes('ドライヤー 中古').condition, 'used');
  assert.equal(variantAttributes('アウトレット スニーカー').condition, 'outlet');
  assert.equal(compareVariants('ドライヤー', 'ドライヤー 中古'), 'different');
});

test('店の宣伝（ポイント10倍 11月15日・【公式】・送料無料）を色番・容量と読み違えない', () => {
  const promo = '【公式】ポイント10倍 11月15日 送料無料 ロムアンド グラスティングカラーグロス 04 4g';
  const attrs = variantAttributes(promo);
  assert.equal(attrs.color, '04', '11月15日の15やポイント10倍の10は色番ではない');
  assert.equal(attrs.capacity, '4g');
  assert.equal(compareVariants(promo, BASE_04), 'same');
  assert.equal(variantAttributes('【公式】ポイント10倍 11月15日 送料無料 グロス').color, null);
});

test('属性 (attributes) からも色番・容量を読む', () => {
  const attrs = variantAttributes('グロス', { color: '04', capacity: '4g' });
  assert.equal(attrs.color, '04');
  assert.equal(attrs.capacity, '4g');
  assert.equal(compareVariants({ title: 'グロス', attributes: '{"color":"04"}' }, 'グロス 04'), 'same');
});

// tier 4 への組み込み
const offer = (overrides) => normalizeOffer({
  source_product_id: overrides.source_product_id || 'X',
  updated_at: '2026-11-14T00:00:00Z',
  ...overrides
}, { sourceMarketplace: overrides.source_marketplace || 'RAKUTEN_JP' });

test('tier 4: ブランド＋正式名が一致しても色番が複数（未確認）なら一致にしない', () => {
  const a = offer({ source_product_id: 'V1', brand: 'rom&nd', title: 'グラスティングカラーグロス 01・04・05' });
  const b = offer({ source_product_id: 'V2', source_marketplace: 'YAHOO_JP', brand: 'rom&nd', title: 'グラスティングカラーグロス 01・04・05' });
  assert.equal(matchProductIdentity(a, b).matched, false);
});

test('tier 4: 正規化で同じ名前になっても 4.0g と 40g は別', () => {
  const a = offer({ source_product_id: 'V3', brand: 'rom&nd', title: 'グラスティングカラーグロス 04 4.0g' });
  const b = offer({ source_product_id: 'V4', source_marketplace: 'YAHOO_JP', brand: 'rom&nd', title: 'グラスティングカラーグロス 04 40g' });
  assert.equal(a.normalized_title, b.normalized_title, '前提: 既存の正規化では . が消えて同じ名前になる');
  assert.equal(matchProductIdentity(a, b).matched, false);
});

test('tier 4: 色番が両方で分かって一致すれば従来どおり一致', () => {
  const a = offer({ source_product_id: 'V5', brand: 'rom&nd', title: 'グラスティングカラーグロス 04 4g' });
  const b = offer({ source_product_id: 'V6', source_marketplace: 'YAHOO_JP', brand: 'rom&nd', title: 'グラスティングカラーグロス 04 4g' });
  assert.deepEqual(matchProductIdentity(a, b), { tier: 'brand_title_size', matched: true });
});

test('JAN の一致は照合の影響を受けない', () => {
  const a = offer({ source_product_id: 'V7', jan: '4912345678904', title: 'グロス 01・04・05' });
  const b = offer({ source_product_id: 'V8', source_marketplace: 'YAHOO_JP', jan: '4912345678904', title: 'グロス S04' });
  assert.equal(matchProductIdentity(a, b).tier, 'jan');
});
