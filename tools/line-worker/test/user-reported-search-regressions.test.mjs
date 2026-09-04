import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterCategoryMismatches } from '../src/knowledge-search.mjs';
import { expandSearchQuery } from '../src/query-expansion.mjs';

const candidate = (asin, name) => ({ asin, product_name: name, offers: [] });

test('スモーキークォーツ リング検索ではピアスを除外し指輪だけを残す', () => {
  const results = filterCategoryMismatches('スモーキークォーツ リング オシャレ', [
    candidate('RING', 'スモーキークォーツ 天然石 リング 指輪'),
    candidate('PIERCE', 'スモーキークォーツ パール ピアス')
  ]);
  assert.deepEqual(results.map((item) => item.asin), ['RING']);
});

test('自立トートバッグは構造属性を保った検索語へ展開し別種バッグを除外する', () => {
  const expanded = expandSearchQuery('自立トートバッグ');
  assert.equal(expanded.expansion?.rule_id, 'self-standing-tote-bag');
  assert.match(expanded.query, /自立/);
  assert.match(expanded.query, /トートバッグ/);
  assert.match(expanded.query, /底板/);
  const results = filterCategoryMismatches(expanded.query, [
    candidate('TOTE', '底板付き 自立 トートバッグ A4'),
    candidate('SHOULDER', '自立 ショルダーバッグ')
  ]);
  assert.deepEqual(results.map((item) => item.asin), ['TOTE']);
});

test('商品一覧は内部縦スクロールを使わず検索窓だけを固定する', async () => {
  const [layout, sticky, app] = await Promise.all([
    readFile(new URL('../public/ai-search-layout-fix.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/sticky-nav.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  ]);
  assert.match(layout, /\.result-track\{[\s\S]*?max-height:none;[\s\S]*?overflow-y:visible;/);
  assert.match(sticky, /\.search-results-active \.topbar,[\s\S]*?position:\s*static/);
  assert.match(sticky, /\.search-results-active \.sticky-search\s*\{[\s\S]*?top:\s*0/);
  assert.match(app, /document\.documentElement\.classList\.add\('search-results-active'\)/);
});

test('本革トートバッグはショルダーバッグ単体と財布を除外する', () => {
  const results = filterCategoryMismatches('本革 トートバッグ', [
    candidate('TOTE', '本革 トートバッグ レディース A4'),
    candidate('SHOULDER', '本革 ショルダーバッグ'),
    candidate('WALLET', '本革 長財布')
  ]);
  assert.deepEqual(results.map((item) => item.asin), ['TOTE']);
});

test('商品棚の表示順位は候補の旧rankではなく必ずNO.1から振り直す', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const safeRank=index\+1/);
  assert.doesNotMatch(app, /Number\(candidate\.rank\)\|\|index\+1/);
});

// 2026-09-04 大隆さん実機報告: 「底開口 水筒」で底が外せる水筒（ドウシシャ sokomo
// 「そこまで洗えるボトル」等）が出ない。展開規則の正式名詞がモール検索語の段階で
// 「水筒」まで削られていた。
test('底開口 水筒 は「そこまで洗えるボトル 水筒」へ展開され、その語がモールへ第1候補として渡る', async () => {
  const { buildRakutenSearchKeywordCandidates, buildAmazonSearchKeywords, buildMarketplaceApiKeywordCandidates } = await import('../src/index.mjs');
  for (const raw of ['底開口 水筒', '底が外せる水筒', '底まで洗えるボトル', '分解して洗える 水筒']) {
    const expanded = expandSearchQuery(raw);
    assert.equal(expanded.expansion?.rule_id, 'bottom-removable-bottle', raw);
    assert.equal(buildRakutenSearchKeywordCandidates(expanded.query, expanded.query)[0], 'そこまで洗えるボトル 水筒', raw);
    assert.equal(buildAmazonSearchKeywords(expanded.query), 'そこまで洗えるボトル 水筒', raw);
    assert.equal(buildMarketplaceApiKeywordCandidates(expanded.query, '水筒', '水筒')[0], 'そこまで洗えるボトル 水筒', raw);
  }
  // 展開規則の無い検索は従来どおり
  assert.equal(expandSearchQuery('水筒 500ml').expanded, false);
  const results = filterCategoryMismatches(expandSearchQuery('底開口 水筒').query, [
    candidate('SOKOMO', '【そこまで洗えるボトル】ドウシシャ 水筒 ステンレスボトル 1.0L 真空断熱 sokomo'),
    candidate('BRUSH', '水筒 洗浄ブラシ 底まで届く')
  ]);
  assert.ok(results.some((item) => item.asin === 'SOKOMO'));
});

// 2026-09-04 大隆さん実機報告（続き）: AI が「底開口 水筒」を「ドウシシャ sokomo そこまで洗えるボトル 水筒」
// へ直しても、その後の組み立てで「水筒」1語まで削られ AI 変換が無駄になっていた。
test('AI が直した短い検索語は、そのまま楽天/Yahoo の候補に残る', async () => {
  const { verbatimRefinedQueryCandidate, buildRakutenSearchKeywordCandidates, buildMarketplaceApiKeywordCandidates } = await import('../src/index.mjs');
  const refined = 'ドウシシャ sokomo そこまで洗えるボトル 水筒';
  assert.equal(verbatimRefinedQueryCandidate(refined, '底開口 水筒'), refined);
  assert.ok(buildRakutenSearchKeywordCandidates(refined, '底開口 水筒').includes(refined));
  assert.ok(buildMarketplaceApiKeywordCandidates(refined, '水筒', '水筒', '底開口 水筒').includes(refined));
  // 一般語「水筒」は後段の候補として残る
  assert.ok(buildRakutenSearchKeywordCandidates(refined, '底開口 水筒').includes('水筒'));
  // AI 変換が無い（元の語と同じ）／長文／句読点入りは対象外
  assert.equal(verbatimRefinedQueryCandidate('水筒 500ml', '水筒 500ml'), '');
  assert.equal(verbatimRefinedQueryCandidate('水筒 500ml', ''), '');
  assert.equal(verbatimRefinedQueryCandidate('底が取り外せて分解して丸洗いできる真空断熱のステンレス製の大容量の水筒 1リットル 子ども用', '底開口 水筒'), '');
  assert.equal(verbatimRefinedQueryCandidate('底が外せる水筒、ありますか？', '底開口 水筒'), '');
});

// 2026-09-04 大隆さん実機報告②: 「底開口 水筒」で、検索窓が「そこまで洗えるボトル 水筒 底が外せる 水筒 洗いやすい」
// と語が重複し、NO.1 が底の外せない普通の水筒（moz）だった。
test('検索窓へ返す検索語は重複語を落とし、展開規則の語に一致する商品を先に並べる', async () => {
  const { dedupeQueryTokens } = await import('../src/index.mjs');
  const { rankMerchantCandidates, expansionMatchScore } = await import('../src/knowledge-search.mjs');
  assert.equal(dedupeQueryTokens('そこまで洗えるボトル 水筒 底が外せる 水筒 洗いやすい'), 'そこまで洗えるボトル 水筒 底が外せる 洗いやすい');
  assert.equal(dedupeQueryTokens('水筒 500ml'), '水筒 500ml');
  const query = 'そこまで洗えるボトル 水筒 底が外せる 洗いやすい';
  const moz = candidate('MOZ', 'moz マグボトル 500ml ステンレスボトル ハンドル付き 送料無料');
  const sokomo = candidate('SOKOMO', '【そこまで洗えるボトル】ドウシシャ 水筒 底が取り外せる 1.0L');
  const gorilla = candidate('GORILLA', 'ゴリラの底ヂカラ 水筒 ステンレス');
  assert.equal(expansionMatchScore(query, sokomo), 1);
  assert.equal(expansionMatchScore(query, gorilla), 0.8);
  assert.equal(expansionMatchScore(query, moz), 0);
  assert.equal(expansionMatchScore('水筒 500ml', sokomo), 0);
  const ranked = rankMerchantCandidates([moz, gorilla, sokomo], [], query);
  assert.deepEqual(ranked.map((item) => item.asin), ['SOKOMO', 'GORILLA', 'MOZ']);
});

// 2026-09-05 大隆さん指示: 「底開口 水筒」に限らず、利用者の機能語≠売り手の語の型を大量に用意する。
test('機能語→売り手の語の展開規則は、規則ごとにモール検索語と順位付けが効き、教師データにも書き出される', async () => {
  const { FEATURE_EXPANSION_RULES } = await import('../src/query-expansion-feature-rules.mjs');
  const { buildRakutenSearchKeywordCandidates, buildAmazonSearchKeywords } = await import('../src/index.mjs');
  const { expansionMatchScore } = await import('../src/knowledge-search.mjs');
  const { buildFeatureTeacherEntries } = await import('../scripts/build-feature-teacher-batch.mjs');
  assert.ok(FEATURE_EXPANSION_RULES.length >= 40, `rules: ${FEATURE_EXPANSION_RULES.length}`);
  for (const rule of FEATURE_EXPANSION_RULES) {
    assert.ok(rule.match.test(rule.sample), `${rule.id}: sample should match`);
    assert.ok(rule.teacher.queries.length >= 2, `${rule.id}: teacher queries`);
    for (const query of rule.teacher.queries) {
      const expanded = expandSearchQuery(query);
      assert.equal(expanded.expansion?.rule_id, rule.id, `${rule.id}: ${query}`);
      assert.equal(buildRakutenSearchKeywordCandidates(expanded.query, expanded.query)[0], rule.marketplaceKeywords, `${rule.id}: rakuten ${query}`);
      assert.equal(buildAmazonSearchKeywords(expanded.query), rule.marketplaceKeywords, `${rule.id}: amazon ${query}`);
    }
    // 売り手の語で書かれた商品名は、規則の語で順位が上がる
    assert.ok(expansionMatchScore(expandSearchQuery(rule.sample).query, candidate('X', rule.marketplaceKeywords)) >= 0.8, `${rule.id}: ranking`);
  }
  const entries = buildFeatureTeacherEntries(FEATURE_EXPANSION_RULES, '2026-09-05');
  assert.ok(entries.length >= 100, `teacher entries: ${entries.length}`);
  assert.ok(entries.every((entry) => entry.search_terms.ja.length >= 1 && entry.ideal_answer && entry.category));
  // 汎用語だけの検索は規則に当たらない（誤爆防止）
  for (const plain of ['水筒', '弁当箱', 'ハンガー', 'カーテン', 'マスカラ', 'スニーカー', '掃除機', '枕', 'イヤホン', 'リュック']) {
    assert.equal(expandSearchQuery(plain).expanded, false, plain);
  }
});
