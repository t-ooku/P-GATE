import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPromoDeliverable, extractNumbers, allowedNumbersFromProducts, simhash64, hammingDistance, xWeightedLength, articleChars } from '../src/seller-promo-qa.mjs';
import { articlePayload, snsPayload, improvementPayload, longText } from './helpers/seller-promo-fixture.mjs';

const products = [{ id: 'spp_1', name: '玄関収納ボックス', price_jpy: 2980, url: 'https://item.rakuten.co.jp/qa/box-1/', attrs: { 幅: '40cm' } }];
const questions = [{ id: 'spq_1', text: '玄関に置けるか' }];
const ctx = { products, questions, ngWords: ['激安'] };

test('fixture の記事・SNS・直し案は検査に通る', () => {
  const article = checkPromoDeliverable('ARTICLE', articlePayload('spp_1'), ctx);
  assert.equal(article.passed, true, JSON.stringify(article.qa.reasons));
  assert.ok(article.qa.chars >= 1500 && article.qa.chars <= 2500);
  for (const post of snsPayload('spp_1').posts) assert.equal(checkPromoDeliverable('SNS', post, ctx).passed, true);
  assert.equal(checkPromoDeliverable('IMPROVEMENT', improvementPayload('spp_1', 'spq_1'), ctx).passed, true);
});

test('数値は商品データにある値だけ。カンマ区切り・全角も照合し、数え言葉の 1〜10 は許す', () => {
  assert.deepEqual(extractNumbers('価格は２，９８０円で幅40cm').map((n) => n.value), ['2980', '40']);
  assert.ok(allowedNumbersFromProducts(products).has('2980'));
  const ok = articlePayload('spp_1', { lead: `${longText(3)}価格は2,980円、幅は40cmです。選び方は3つあります。` });
  assert.equal(checkPromoDeliverable('ARTICLE', ok, ctx).passed, true);
  const bad = checkPromoDeliverable('ARTICLE', articlePayload('spp_1', { lead: `${longText(3)}容量は25リットル、いまなら1,480円。` }), ctx);
  assert.equal(bad.passed, false);
  assert.deepEqual(bad.qa.reasons.find((r) => r.code === 'NUMBER_NOT_IN_PRODUCT_DATA').detail, '25,1480');
});

test('禁止表現と店の NG 語で落とす', () => {
  const result = checkPromoDeliverable('ARTICLE', articlePayload('spp_1', { title: '医師推奨！今だけ激安の収納' }), ctx);
  const hit = result.qa.reasons.find((r) => r.code === 'FORBIDDEN_EXPRESSION');
  assert.ok(hit && /医師推奨/.test(hit.detail) && /今だけ/.test(hit.detail) && /激安/.test(hit.detail));
});

test('外部 URL は除き（店の商品 URL は残す）、ASIN を作ったら落とす', () => {
  const payload = articlePayload('spp_1', { lead: `${longText(3)}詳しくは https://evil.example/x と https://item.rakuten.co.jp/qa/box-1/ へ` });
  const result = checkPromoDeliverable('ARTICLE', payload, ctx);
  assert.deepEqual(result.qa.removed_urls, ['https://evil.example/x']);
  assert.doesNotMatch(result.payload.lead, /evil/);
  assert.match(result.payload.lead, /item\.rakuten/);
  const asin = checkPromoDeliverable('IMPROVEMENT', { ...improvementPayload('spp_1', 'spq_1'), before: 'B0ABCDEFGH の説明' }, ctx);
  assert.ok(asin.qa.reasons.some((r) => r.code === 'IDENTIFIER_GENERATED'));
  const amazon = [{ ...products[0], url: 'https://www.amazon.co.jp/dp/B0AAAAAAAA' }];
  const linked = checkPromoDeliverable('IMPROVEMENT', { ...improvementPayload('spp_1', 'spq_1'), after_md: '詳しくは https://www.amazon.co.jp/dp/B0AAAAAAAA をご覧ください' }, { ...ctx, products: amazon });
  assert.equal(linked.qa.reasons.some((r) => r.code === 'IDENTIFIER_GENERATED'), false);
});

test('文字数・SNS 文字数・画像文字数・知らない商品 ID を落とす', () => {
  const short = checkPromoDeliverable('ARTICLE', articlePayload('spp_1', { sections: [{ h2: 'a', body_md: '短い' }, { h2: 'b', body_md: '短い' }] }), ctx);
  assert.ok(short.qa.reasons.some((r) => r.code === 'ARTICLE_LENGTH'));
  const post = snsPayload('spp_1').posts[0];
  const longX = checkPromoDeliverable('SNS', { ...post, variants: { ...post.variants, x: 'あ'.repeat(141) } }, ctx);
  assert.ok(longX.qa.reasons.some((r) => r.code === 'SNS_LENGTH' && r.detail === 'x'));
  assert.equal(xWeightedLength('abc'), 3);
  assert.equal(xWeightedLength('あいう'), 6);
  const longHeadline = checkPromoDeliverable('SNS', { ...post, image_brief: { ...post.image_brief, headline: 'あ'.repeat(15) } }, ctx);
  assert.ok(longHeadline.qa.reasons.some((r) => r.code === 'IMAGE_TEXT_LENGTH'));
  const unknown = checkPromoDeliverable('IMPROVEMENT', improvementPayload('spp_x', 'spq_x'), ctx);
  assert.ok(unknown.qa.reasons.some((r) => r.code === 'PRODUCT_REF_UNKNOWN'));
  assert.ok(unknown.qa.reasons.some((r) => r.code === 'EVIDENCE_UNKNOWN'));
});

test('同型検査: 他店の記事と h2 の並びがほぼ同じなら落とす', () => {
  const payload = articlePayload('spp_1');
  const mine = simhash64(payload.sections.map((s) => s.h2));
  assert.equal(hammingDistance(mine, mine), 0);
  const other = simhash64(['まったく別の話題について', '季節ごとの楽しみ方', '長く使うために']);
  assert.ok(hammingDistance(mine, other) > 3);
  const same = checkPromoDeliverable('ARTICLE', payload, { ...ctx, otherSimhashes: [mine] });
  assert.ok(same.qa.reasons.some((r) => r.code === 'SAME_STRUCTURE_ACROSS_SELLERS'));
  assert.equal(checkPromoDeliverable('ARTICLE', payload, { ...ctx, otherSimhashes: [other] }).passed, true);
  assert.ok(articleChars(payload) > 0);
});

// 2026-10-03 Cowork 依頼 §9（QA 店舗の初回記事の所見から）
test('§9: 税の表記は商品データにあるときだけ残し、4 桁以上の価格は 3 桁区切りに揃える', async () => {
  const { formatPromoText } = await import('../src/seller-promo-qa.mjs');
  assert.equal(formatPromoText('価格は1980円（税込）です。').text, '価格は1,980円です。');
  assert.equal(formatPromoText('税込2980円、880円(税抜)').text, '2,980円、880円');
  assert.equal(formatPromoText('1,980円（税込）', { taxLabelKnown: true }).text, '1,980円（税込）');
  assert.equal(formatPromoText('幅40cm、880円').changed, false);
  const products = [{ id: 'spp_1', name: '収納かご', price_jpy: 1980, attrs: { 幅: '30cm', 素材: '綿' } }];
  const out = checkPromoDeliverable('SNS', { theme: 'かご', variants: { instagram: 'かごです。1980円（税込）。', x: 'かご 1980円（税込）', threads: 'かごです。1980円です。' },
    image_brief: { product_id: 'spp_1', headline: 'かご', sub: '綿 1980円' } }, { products });
  assert.equal(out.payload.variants.instagram, 'かごです。1,980円。');
  assert.equal(out.payload.image_brief.sub, '綿 1,980円');
  assert.deepEqual(out.qa.formatted, ['TAX_OR_PRICE_FORMAT']);
  assert.equal(out.passed, true);
});

test('§9: 「お店に確認」「商品データ上」などの第三者・内部の言い回しは不合格', () => {
  const products = [{ id: 'spp_1', name: '収納かご', price_jpy: 1980, attrs: {} }];
  for (const text of ['お手入れは直接お店に確認してください。', '商品データ上、記載がございません。', '詳しくはお店にご確認ください。']) {
    const out = checkPromoDeliverable('SNS', { theme: 'かご', variants: { instagram: text, x: 'かご', threads: 'かご' },
      image_brief: { product_id: 'spp_1', headline: 'かご', sub: '' } }, { products });
    assert.equal(out.passed, false, text);
    assert.ok(out.qa.reasons.some((r) => r.code === 'FORBIDDEN_EXPRESSION'), text);
  }
});

test('§9: 商品データに無い性質語は「要確認」の注記（不合格にしない）。疑問の形・データにある語は拾わない', async () => {
  const { unverifiedPropertyClaims } = await import('../src/seller-promo-qa.mjs');
  const products = [{ id: 'spp_1', name: '玄関収納ボックス', price_jpy: 2980, attrs: { 素材: 'ポリプロピレン', 特徴: '軽量' } }];
  assert.deepEqual(unverifiedPropertyClaims(['ポリプロピレン素材は日常のお手入れもしやすく、丈夫です。'], products), ['丈夫', 'お手入れもしやす']);
  assert.deepEqual(unverifiedPropertyClaims(['洗えるかどうかはお問い合わせください。', '軽量なボックスです。'], products), []);
  const out = checkPromoDeliverable('SNS', { theme: '箱', variants: { instagram: '丈夫な箱です。', x: '箱', threads: '箱' },
    image_brief: { product_id: 'spp_1', headline: '箱', sub: '' } }, { products });
  assert.equal(out.passed, true);
  assert.deepEqual(out.qa.notes, [{ code: 'PROPERTY_CLAIM_UNVERIFIED', detail: '丈夫' }]);
});

test('§9-5 の作り直しで残った点: 素材・価格の評価は要確認、「製品情報に記載がございません」は不合格、同じ漢字の重複は誤字の疑い', async () => {
  const { doubledKanjiSuspects } = await import('../src/seller-promo-qa.mjs');
  assert.deepEqual(doubledKanjiSuspects(['目目的にあわせて', '人々の暮らし', '時々']), ['目目']);
  const products = [{ id: 'spp_1', name: '収納かご', price_jpy: 880, attrs: { 素材: '綿' } }];
  const sns = (instagram) => checkPromoDeliverable('SNS', { theme: 'かご', variants: { instagram, x: 'かご', threads: 'かご' },
    image_brief: { product_id: 'spp_1', headline: 'かご', sub: '' } }, { products });
  const evaluated = sns('綿素材は扱いやすく、880円とお求めやすい設定です。目目的にあわせて。');
  assert.equal(evaluated.passed, true);
  assert.deepEqual(evaluated.qa.notes, [{ code: 'PROPERTY_CLAIM_UNVERIFIED', detail: '扱いやす,お求めやす' }, { code: 'TYPO_SUSPECT', detail: '目目' }]);
  for (const text of ['お手入れ方法は製品情報に記載がございません。', 'お手入れ方法の詳細は詳しくはお問い合わせください。']) {
    assert.ok(sns(text).qa.reasons.some((r) => r.code === 'FORBIDDEN_EXPRESSION'), text);
  }
});
