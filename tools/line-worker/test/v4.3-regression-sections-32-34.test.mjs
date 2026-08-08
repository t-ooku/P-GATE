import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandSearchQuery } from '../src/query-expansion.mjs';
import { buildPriceComparison, realPriceRows } from '../src/ai-price-comparison.mjs';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// v4.3 指示書 section 32-34: 必須回帰テストの一覧をこの1ファイルへ集約する
// (v4.2-item23-required-queries.test.mjsと同じ「1ファイルに集約して、後から
// この指示書の何を満たしているか一目で分かるようにする」という方針を踏襲)。
// 個々のロジックの詳細な単体テストは各機能のテストファイル
// (query-expansion.test.mjs / ai-chat-search-cta.test.mjs /
// ai-price-comparison.test.mjs / price-comparison-api.test.mjs 等)側にある
// ため、ここでは「指示書の各項目が満たされている」ことをend-to-endに近い形で
// 再確認するだけにとどめる。

// section 32: 必須検索テスト(8クエリ)。v4.2項目23と同一のクエリ集合。
// 実際の展開ロジックのテストは test/v4.2-item23-required-queries.test.mjs
// (既存、無傷)が既に持っているので、ここでは「8クエリ全部が例外を投げずに
// 処理できる」ことだけ最終確認する。
const REQUIRED_QUERIES_SECTION_32 = [
  '顔用扇風機', '暑い時に顔に風くるやつ', 'カットソー', '透明ワイヤレスイヤホン',
  '韓国っぽいバッグ', '旅行で荷物を小さくしたい', 'テレビにYouTube映すやつ', '名前が分からないけど透明なやつ'
];

test('v4.3項目32: 指示書の8つの必須検索クエリはすべて例外を投げずにQuery Expansionを通過する', () => {
  for (const query of REQUIRED_QUERIES_SECTION_32) {
    assert.doesNotThrow(() => expandSearchQuery(query), `query "${query}" should not throw`);
  }
});

// section 33: AI会話検索テスト(顔用扇風機→AIで探す→...→この条件で探す→
// HOSHILU再検索→MATCHES更新)。この一連の流れのうち、v4.3で新規に追加された
// 「この条件で探す」CTAの存在はtest/ai-chat-search-cta.test.mjsで検証済み。
// 検索文の引き継ぎ・Gemini優先/OpenAIフォールバック・商品創作禁止は
// v4.2項目6-9として test/ai-search-ui.test.mjs が既に検証済み(無傷)。
// ここでは両者が同じファイル内に共存していることだけ最終確認する。
test('v4.3項目33: AI会話検索の一連の要件(検索文引継ぎ・CTA・商品創作禁止)が同じ実装内に揃っている', async () => {
  const script = await read('ai-search-ui.mjs');
  assert.match(script, /const history = \[\{ role: 'user', text: originalQuery \}\]/); // 検索文引継ぎ
  assert.match(script, /searchCta: 'この条件で探す'/); // v4.3新規CTA
  const intent = await readFile(new URL('../src/ai-chat-intent.mjs', import.meta.url), 'utf8');
  assert.match(intent, /Never include a price, stock status, product URL, or a claim that you found a specific real product/); // 商品創作禁止
});

// section 34: AI最安比較テスト(実価格ショップ・AI推定ショップ・推定ラベル・
// 注意書き・ショップリンク・最安判定文言を確認し、実価格と推定価格が混同
// されないこと)。詳細は test/ai-price-comparison.test.mjs /
// test/price-comparison-api.test.mjs / Playwrightでの実画面確認
// (screenshotで実価格=緑・AI推定=オレンジ・推定不能=グレーの3種が視覚的に
// 分離されていることを確認済み)。ここでは1商品について全要件を1テストで
// 再確認する。
test('v4.3項目34: 1商品について実価格・AI推定・注意書き・最安判定文言が揃い、混同されない', () => {
  const comparison = buildPriceComparison({
    real: realPriceRows([
      { marketplace: 'AMAZON_JP', total_cost: 8980, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=a' },
      { marketplace: 'RAKUTEN_JP', total_cost: 9180, currency: 'JPY', tracking_url: 'https://hoshilu.app/go?token=b' }
    ]),
    aiEstimates: [
      { marketplace: 'LOFT_JP', range_min: 8000, range_max: 10000, confidence: 'HIGH' },
      { marketplace: 'HANDS_JP', range_min: 8500, range_max: 10500, confidence: 'MEDIUM' }
    ],
    requestedDirectMarketplaces: ['LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP'],
    language: 'JA'
  });
  // 実価格ショップ
  assert.equal(comparison.real.length, 2);
  assert.ok(comparison.real.every((row) => row.source === 'REAL' && row.tracking_url));
  // AI推定ショップ・推定ラベル(confidence)
  assert.equal(comparison.ai_estimated.length, 2);
  assert.ok(comparison.ai_estimated.every((row) => row.source === 'AI_ESTIMATE' && row.confidence));
  // 推定不能(価格推定できません相当)
  assert.deepEqual(comparison.unavailable.map((row) => row.marketplace), ['MATSUKIYO_JP']);
  // 注意書き
  assert.equal(comparison.disclaimer_required, true);
  assert.match(comparison.disclaimer_text, /AI推定価格です。実際の販売価格・在庫はショップで確認してください。/);
  // 最安判定文言(実価格同士のみ断定)
  assert.equal(comparison.cheapest_claim.definitive, true);
  assert.equal(comparison.cheapest_claim.marketplace, 'AMAZON_JP');
  // 実価格とAI推定が混同されていない(別配列・別sourceラベル)
  const realMarketplaces = new Set(comparison.real.map((row) => row.marketplace));
  const estimateMarketplaces = new Set(comparison.ai_estimated.map((row) => row.marketplace));
  assert.equal([...realMarketplaces].some((m) => estimateMarketplaces.has(m)), false);
});
