import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { lookupTeacherDatasetEntry, teacherDatasetStats } from '../src/search-quality/teacher-dataset-lookup.mjs';
import { structureSearchQuery } from '../src/search-quality/query-structurer.mjs';
import { filterCategoryMismatches } from '../src/knowledge-search.mjs';
import { buildAmazonSearchKeywords, buildRakutenSearchKeywords } from '../src/index.mjs';

test('Day1バッチがコンパイル済みアーティファクトへ反映されている', () => {
  const stats = teacherDatasetStats();
  assert.ok(stats.entryCount >= 90, `expected at least 90 compiled entries, got ${stats.entryCount}`);
  assert.ok(stats.sourceBatches.some((name) => name.includes('day1')));
});

test('子ども・高齢者・外国人ペルソナがそれぞれ最低件数カバーされている', async () => {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(new URL('../evaluation/teacher-dataset/2026-08-06-day1-batch-001.json', import.meta.url), 'utf8');
  const records = JSON.parse(raw);
  const byPersona = (persona) => records.filter((item) => item.persona === persona).length;
  assert.ok(byPersona('child') >= 20, `child coverage: ${byPersona('child')}`);
  assert.ok(byPersona('elderly') >= 10, `elderly coverage: ${byPersona('elderly')}`);
  assert.ok(byPersona('foreign') >= 20, `foreign coverage: ${byPersona('foreign')}`);
});

test('query-structurerはUNKNOWNな曖昧クエリを教師データのideal_answerで解決する', () => {
  const result = structureSearchQuery('ゲームにつなぐやつ', 'ja');
  assert.ok(result.teacher_dataset_match);
  assert.match(result.teacher_dataset_match.ideal_answer, /ゲーム機/);
});

test('query-structurerは教師データの具体カテゴリでproduct_typeを解決する', () => {
  const result = structureSearchQuery('充電する線', 'ja');
  assert.equal(result.product_type, 'cable');
  assert.ok(result.teacher_dataset_match);
});

test('buildAmazonSearchKeywordsは教師データの検索語を直接使う(カットソー)', () => {
  assert.equal(buildAmazonSearchKeywords('カットソー'), 'カットソー レディース カットソー');
});

test('buildRakutenSearchKeywordsは教師データの検索語を直接使う(軽い掃除機)', () => {
  const result = buildRakutenSearchKeywords('軽い掃除機');
  assert.match(result, /軽量 掃除機/);
});

test('filterCategoryMismatchesは教師データのexcluded_conditionsで候補を除外する(カットソー)', () => {
  const entry = lookupTeacherDatasetEntry('カットソー');
  assert.ok(entry.excluded_conditions.includes('家具'));
  const filtered = filterCategoryMismatches('カットソー', [
    { asin: 'REAL01', product_name: 'レディース カットソー 長袖 白 トップス' },
    { asin: 'BAD01', product_name: 'ローテーブル 家具 木製' }
  ]);
  assert.deepEqual(filtered.map((item) => item.asin), ['REAL01']);
});

test('必須検索テストの6クエリすべてが教師データで解決またはUNCLASSIFIED確認質問を持つ', () => {
  const requiredQueries = [
    'カットソー',
    '透明ワイヤレスイヤホン',
    '韓国っぽいバッグ',
    'SNSで見た透明なやつ',
    '旅行で荷物を小さくしたい',
    '名前が分からないけど透明なやつ'
  ];
  for (const query of requiredQueries) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `no teacher-dataset entry for "${query}"`);
    assert.ok(entry.ideal_answer, `no ideal_answer for "${query}"`);
  }
});

// 老若男女カバレッジ拡充 (2026-08-07 batch-002/003/004)。
// batch-001 は child 19件 / elderly 10件と手薄で、子どもと高齢者が実際に
// 使う「商品名を知らない言い方」がほとんど入っていなかった。HOSHILUの前提
// (商品名が分からなくても探せる)が最も効くのがこの2ペルソナなので、ここを
// 厚くしたぶんが失われないよう件数と代表クエリを固定する。
test('教師データが全ペルソナで実用的な件数を保っている', () => {
  const stats = teacherDatasetStats();
  assert.ok(stats.entryCount >= 439, `expected at least 439 compiled entries, got ${stats.entryCount}`);
  assert.ok(stats.sourceBatches.length >= 11, `expected at least 11 batches, got ${stats.sourceBatches.length}`);
});

test('子ども・高齢者の言い換えから商品を引ける', () => {
  const cases = [
    // 子ども: 動作や見た目でしか説明できない言い方
    ['えんぴつの芯が出るやつ', 'child', 'シャープペンシル'],
    ['丸をかくやつ', 'child', 'コンパス'],
    ['字を消すやつ', 'child', '消しゴム'],
    ['こおりがとけないみずとう', 'child', '保冷'],
    ['あぶないときならすやつ', 'child', '防犯ブザー'],
    // 高齢者: 困りごとから要件を導く言い方
    ['小さい字を大きくして見るやつ', 'elderly', '拡大鏡'],
    ['びんのふたをあける道具', 'elderly', 'オープナー'],
    ['しゃがまずに靴をはくやつ', 'elderly', '靴べら'],
    ['くすりを飲みわすれないようにするやつ', 'elderly', '服薬'],
  ];
  for (const [query, persona, expected] of cases) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `missing teacher entry: ${query}`);
    assert.equal(entry.persona, persona, `${query}: persona`);
    assert.match(entry.ideal_answer, new RegExp(expected), `${query}: ideal_answer`);
  }
});

// 「丸をかくやつ」は製図用コンパスで、方位磁針ではない。この手の同名異物は
// excluded_conditions で明示していないと、モール側の検索で簡単に取り違える。
test('同名異物・別用途を excluded_conditions で除外している', () => {
  assert.deepEqual(lookupTeacherDatasetEntry('丸をかくやつ').excluded_conditions, ['方位磁針', '登山用コンパス', '方位磁石']);
  assert.ok(lookupTeacherDatasetEntry('うわばき').excluded_conditions.some((item) => item.includes('外')));
  assert.ok(lookupTeacherDatasetEntry('洗濯機の中を洗うもの').excluded_conditions.includes('柔軟剤'));
  assert.ok(lookupTeacherDatasetEntry('お風呂のカビを防ぐやつ').excluded_conditions.some((item) => item.includes('カビ取り剤')));
});

// 医療・健康に踏み込むクエリは、商品を断定せず確認を返す。誤った製品を勧める
// ことが実害になりうる領域なので confidence を低く保ち、ideal_answer を
// 問いかけにしておく。
test('医療判断が必要なクエリは断定せず確認を返す', () => {
  for (const query of ['耳が遠くなってきたので音を大きくするやつ', '血の数値をはかる機械', '腰にはるやつ']) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `missing teacher entry: ${query}`);
    assert.equal(entry.category, 'UNCLASSIFIED', `${query}: should stay unclassified`);
    assert.ok(entry.confidence <= 0.3, `${query}: confidence should stay low, got ${entry.confidence}`);
    assert.match(entry.ideal_answer, /か？|ください/, `${query}: should ask rather than assert`);
  }
});

test('外国語・ローマ字の言い回しからも同じ商品に着地する', () => {
  assert.match(lookupTeacherDatasetEntry('bentou baran plastic leaf').ideal_answer, /バラン/);
  assert.match(lookupTeacherDatasetEntry('suihanki hitori gurashi').ideal_answer, /炊飯器/);
  assert.match(lookupTeacherDatasetEntry('일본 밥솥 소형').ideal_answer, /炊飯器/);
  assert.match(lookupTeacherDatasetEntry('日本 电饭煲 小型 一人用').ideal_answer, /炊飯器/);
  assert.match(lookupTeacherDatasetEntry('kotatsu table heater').ideal_answer, /こたつ/);
});

// 季節・育児・趣味・車まわりの拡充 (batch-005/006/007)。
// この4領域は「症状や場面」でしか説明されないうえ、よく似た別商品が並んで
// いる。検索としては成功していても違う物を買わせてしまうので、
// excluded_conditions が search_terms と同じくらい効く。
test('よく似た別商品を取り違えないよう除外条件を持つ', () => {
  // ウォッシャー液とクーラントの取り違えはエンジンの重大故障になりうる
  const washer = lookupTeacherDatasetEntry('車のウォッシャー液がなくなった');
  assert.ok(washer.excluded_conditions.some((item) => item.includes('クーラント')));
  // 洗顔料ではメイクは落ちない
  const remover = lookupTeacherDatasetEntry('メイクを落とすやつ');
  assert.ok(remover.excluded_conditions.some((item) => item.includes('洗顔料')));
  // 布用と紙用のはさみは別物
  const shears = lookupTeacherDatasetEntry('布を切る大きいはさみ');
  assert.ok(shears.excluded_conditions.some((item) => item.includes('紙用')));
  // 小鳥の砂に猫砂を出さない
  const grit = lookupTeacherDatasetEntry('小鳥のかごに入れる砂');
  assert.ok(grit.excluded_conditions.includes('猫砂'));
  // 結露は「取る」と「防ぐ」で商品が別
  const absorber = lookupTeacherDatasetEntry('窓のまわりが濡れるのを防ぐやつ');
  assert.ok(absorber.excluded_conditions.some((item) => item.includes('ワイパー')));
});

// 人や動物の症状に踏み込むクエリは、市販薬・受診の判断を奪わない。
test('症状に関わるクエリは受診・相談を促して断定しない', () => {
  for (const query of ['虫にさされたあとにぬるやつ', '猫が吐いた毛をなんとかしたい']) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `missing teacher entry: ${query}`);
    assert.equal(entry.category, 'UNCLASSIFIED', `${query}: should stay unclassified`);
    assert.ok(entry.confidence <= 0.3, `${query}: confidence too high`);
    assert.match(entry.ideal_answer, /ご相談|相談してください|医師|薬剤師|動物病院/, `${query}`);
  }
});

test('初心者が道具名を知らない趣味クエリを引ける', () => {
  assert.match(lookupTeacherDatasetEntry('プラモデルの部品を切るやつ').ideal_answer, /ニッパー/);
  assert.match(lookupTeacherDatasetEntry('ギターの音を合わせるやつ').ideal_answer, /チューナー/);
  assert.match(lookupTeacherDatasetEntry('釣りで魚をすくうやつ').ideal_answer, /ランディングネット|玉網/);
  assert.match(lookupTeacherDatasetEntry('星を見るやつ').ideal_answer, /望遠鏡/);
});

// 教師データ全体の不変条件 (2026-08-07)。
//
// batch-005/006/007 を書いている途中で17件見つけた不整合の再発防止。
// ideal_answer が「どちらをお探しですか？」のような確認を返しているのに
// category に具体的な商品カテゴリが入っていた。この2つがずれると、答えは
// 「まだ決められない」と言っているのに、検索側はそのカテゴリで断定して
// 探しに行ってしまう——つまりHOSHILUが最も避けるべき「確認せず決めつける」
// 挙動をデータ側から誘発する。
//
// 断定していない記録は UNCLASSIFIED であること、という一点で揃える。
test('確認を返す記録は必ずUNCLASSIFIEDで、断定と矛盾しない', async () => {
  const compiled = JSON.parse(
    await readFile(new URL('../src/search-quality/teacher-dataset-rules.generated.json', import.meta.url), 'utf8')
  );
  const asksBack = (entry) => /(?:か？|ですか？|ください。?)$/u.test(entry.ideal_answer.trim());
  const mismatched = compiled.entries.filter((entry) => asksBack(entry) && entry.category !== 'UNCLASSIFIED');
  assert.deepEqual(
    mismatched.map((entry) => `${entry.query_text} -> ${entry.category}`),
    [],
    '確認を返しているのに具体カテゴリを持つ記録があります'
  );

  // 逆向き: UNCLASSIFIED は「まだ決められない」という意味なので、
  // 高いconfidenceが付いていたらどちらかが間違っている。
  const overconfident = compiled.entries.filter((entry) => entry.category === 'UNCLASSIFIED' && entry.confidence > 0.5);
  assert.deepEqual(overconfident.map((entry) => entry.query_text), []);
});

test('全記録が必須項目とスキーマ上の値域を満たす', async () => {
  const compiled = JSON.parse(
    await readFile(new URL('../src/search-quality/teacher-dataset-rules.generated.json', import.meta.url), 'utf8')
  );
  const personas = new Set(['child', 'elderly', 'foreign', 'general']);
  const locales = new Set(['ja', 'en', 'ko', 'zh', 'mixed']);
  for (const entry of compiled.entries) {
    assert.ok(entry.query_text?.trim(), 'query_text is required');
    assert.ok(entry.ideal_answer?.trim(), `ideal_answer required: ${entry.query_text}`);
    assert.ok(personas.has(entry.persona), `bad persona: ${entry.query_text}`);
    assert.ok(locales.has(entry.locale), `bad locale: ${entry.query_text}`);
    assert.ok(entry.confidence >= 0 && entry.confidence <= 1, `bad confidence: ${entry.query_text}`);
    assert.ok(Array.isArray(entry.excluded_conditions), `excluded_conditions must be array: ${entry.query_text}`);
  }
  // content_hash は query_text+category+locale なので、同じ質問が2つ残らない
  const hashes = compiled.entries.map((entry) => entry.content_hash);
  assert.equal(new Set(hashes).size, hashes.length, 'duplicate content_hash in compiled artifact');
});

// 規格・型番の領域 (batch-008)。
// 他の領域では惜しい間違いは「役に立たない」で済むが、ここでは物理的に
// 入らない・電圧が合わない・取り付かない、つまり買っても使えない。だから
// 多くの記録は商品を断定せず、足りない情報を聞き返す形にしてある。
// 「電池を買いたい」に対する正直な答えは推測ではなく「どれですか？」。
test('規格が要る商品は推測せず型番・サイズを聞き返す', () => {
  const cases = [
    ['時計の中に入ってる丸い電池', /CR2032|型番|番号/],
    ['リモコンの電池', /単3|単4/],
    ['プリンターのインクがなくなった', /型番/],
    ['空気清浄機のフィルターの替え', /型番|機種/],
    ['電動歯ブラシの先っぽ', /ブラウン|フィリップス|メーカー/],
    ['ふとんカバーの大きさ', /シングル|サイズ/],
    ['スマホに貼るフィルムのサイズ', /機種/],
  ];
  for (const [query, expected] of cases) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `missing teacher entry: ${query}`);
    assert.equal(entry.category, 'UNCLASSIFIED', `${query}: should not assert a product`);
    assert.match(entry.ideal_answer, expected, `${query}`);
  }
});

// 逆に、規格が文面で確定しているものは断定してよい。
test('規格が確定しているものは断定して商品まで答える', () => {
  assert.match(lookupTeacherDatasetEntry('六角の穴のネジを回すやつ').ideal_answer, /六角レンチ/);
  assert.match(lookupTeacherDatasetEntry('星の形の穴のネジ').ideal_answer, /トルクス/);
  assert.match(lookupTeacherDatasetEntry('cr2032 battery equivalent japan').ideal_answer, /CR2032/);
  // 物理的に互換のない端子・工具は取り違えないよう除外しておく
  assert.ok(lookupTeacherDatasetEntry('星の形の穴のネジ').excluded_conditions.includes('六角レンチ'));
  assert.ok(lookupTeacherDatasetEntry('スマホの充電さすところが小さい四角いやつ')
    .excluded_conditions.some((item) => item.includes('Lightning')));
  // 石膏ボードに木ネジを使うと棚ごと落ちる
  assert.ok(lookupTeacherDatasetEntry('棚を壁につけるネジ 石膏ボード')
    .excluded_conditions.some((item) => item.includes('木ネジ')));
});

// 冠婚葬祭 (batch-009)。日本の贈答の作法は、間違いが「役に立たない」では
// なく「失礼」になる。とくに祝儀袋と香典袋は正反対の場面で使うものなので、
// 取り違えを両方向から塞いでおく。
test('祝儀袋と香典袋を取り違えない', () => {
  const koden = lookupTeacherDatasetEntry('お葬式に持っていくお金の袋');
  assert.match(koden.ideal_answer, /香典袋|不祝儀/);
  assert.ok(koden.excluded_conditions.includes('祝儀袋'));

  const shugi = lookupTeacherDatasetEntry('結婚式に持っていくお金の袋');
  assert.match(shugi.ideal_answer, /祝儀袋/);
  assert.ok(shugi.excluded_conditions.includes('香典袋'));

  // 外国語からの入り口でも同じ保護が要る
  const en = lookupTeacherDatasetEntry('japanese funeral money envelope which one');
  assert.match(en.ideal_answer, /香典袋|不祝儀/);
  assert.ok(en.excluded_conditions.includes('祝儀袋'));
});

// 「どこで見たか」しか手がかりが無いクエリは、情報源だけでは商品を決め
// られない。ここで当てにいくと、まったく違う商品を自信満々に出すことになる。
test('見た場所しか分からないクエリは特徴を聞き返す', () => {
  for (const query of ['テレビの通販でやってたやつ', '病院の待合室にあったやつ']) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `missing teacher entry: ${query}`);
    assert.equal(entry.category, 'UNCLASSIFIED');
    assert.ok(entry.confidence <= 0.25, `${query}: confidence too high`);
  }
  // 逆に、場所の記憶が具体的で対象がほぼ決まるものは断定してよい
  assert.match(lookupTeacherDatasetEntry('ホテルにあった小さい冷蔵庫みたいなの').ideal_answer, /小型冷蔵庫/);
  assert.match(lookupTeacherDatasetEntry('飛行機の中で配られたやつ 目にかぶせる').ideal_answer, /アイマスク/);
});

// 防災 (batch-010)。ここは間違いの重さが非対称で、停電時のライトを探して
// いる人にインテリア照明を出すのは、単に外したのではなく役に立たない物を
// 掴ませたことになる。「電源が失われている」前提を除外条件で固定する。
test('防災用品は電源前提の商品を除外する', () => {
  const light = lookupTeacherDatasetEntry('停電のときに使うあかり');
  assert.match(light.ideal_answer, /ランタン/);
  assert.ok(light.excluded_conditions.some((item) => item.includes('コンセント')));

  const radio = lookupTeacherDatasetEntry('電気がなくても使えるラジオ');
  assert.ok(radio.excluded_conditions.some((item) => item.includes('コンセント')));

  // 事前充電が要るモバイルバッテリーは「充電手段が無い」状況の答えにならない
  const charger = lookupTeacherDatasetEntry('スマホの充電が切れたとき 電気がない');
  assert.ok(charger.excluded_conditions.some((item) => item.includes('モバイルバッテリー')));

  // 災害用の簡易トイレと介護用ポータブルトイレは別物
  const toilet = lookupTeacherDatasetEntry('トイレが流せなくなったとき用');
  assert.ok(toilet.excluded_conditions.some((item) => item.includes('ポータブルトイレ')));
});

// 洗濯の相談は原因が菌や皮脂で、香りを足す製品では解決しない。
test('においの相談に香りでごまかす製品を出さない', () => {
  const odor = lookupTeacherDatasetEntry('洗濯物が生乾きのにおいがする');
  assert.match(odor.ideal_answer, /除菌|消臭/);
  assert.ok(odor.excluded_conditions.some((item) => item.includes('柔軟剤')));
  assert.ok(odor.excluded_conditions.some((item) => item.includes('芳香剤')));

  const collar = lookupTeacherDatasetEntry('えりの黄ばみが落ちない');
  assert.ok(collar.excluded_conditions.some((item) => item.includes('柔軟剤')));
});

// 食用作物に使えない薬剤があるため、害虫相談は植物を確認してから。
test('園芸の薬剤は植物と用途を確認してから答える', () => {
  const pest = lookupTeacherDatasetEntry('虫が葉っぱを食べてしまう');
  assert.equal(pest.category, 'UNCLASSIFIED');
  assert.match(pest.ideal_answer, /野菜|食用/);
});

// 体型・容姿の悩み (batch-011)。
// 「お腹まわりが目立たない服」と打つ人が求めているのは服であって、痩せ方の
// 助言ではない。ここでダイエット食品やサプリを出すのは、聞かれていない
// 論評を身体について返すことになる。答えを服の話に留める。
test('体型の悩みにダイエット商材を出さない', () => {
  for (const query of ['お腹まわりが目立たない服', '二の腕を隠したい']) {
    const entry = lookupTeacherDatasetEntry(query);
    assert.ok(entry, `missing teacher entry: ${query}`);
    assert.match(entry.ideal_answer, /トップス|服|袖/, `${query}: answer should stay about clothing`);
    assert.ok(entry.excluded_conditions.some((item) => /ダイエット|サプリ/.test(item)), `${query}`);
  }
  // 薄毛も同様。育毛剤・発毛剤は医薬品領域なので商品として提示しない。
  const hair = lookupTeacherDatasetEntry('髪が薄いのを隠す帽子じゃないやつ');
  assert.equal(hair.category, 'UNCLASSIFIED');
  assert.ok(hair.excluded_conditions.includes('育毛剤'));
});

// 汚れの正体が違うと、いくら強い洗剤でも落ちない。
test('汚れの種類ごとに正しい洗浄剤へ導く', () => {
  // 浴室の鏡の白いくもりは水垢。カビ取り剤では落ちない。
  const mirror = lookupTeacherDatasetEntry('お風呂の鏡が白くくもって取れない');
  assert.match(mirror.ideal_answer, /水垢/);
  assert.ok(mirror.excluded_conditions.includes('カビ取り剤'));
  // まな板のにおいの原因は菌なので、中性洗剤ではなく除菌漂白
  const board = lookupTeacherDatasetEntry('まな板がくさい');
  assert.match(board.ideal_answer, /除菌|漂白/);
  // エアコン内部の自己洗浄は故障・発火の危険があるので商品を勧めない
  const aircon = lookupTeacherDatasetEntry('エアコンの中のカビっぽいにおい');
  assert.equal(aircon.category, 'UNCLASSIFIED');
  assert.match(aircon.ideal_answer, /業者|故障|発火/);
});
