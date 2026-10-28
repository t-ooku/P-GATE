import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHeadNounGate, extractHeadNouns, hasHeadNounMatch, headNounScore } from '../src/search-head-noun.mjs';

test('本番で確認した猫砂マットとマットレス保護カバーは単独候補でも本体検索へ戻さない', () => {
  const cases = [
    ['猫砂が飛び散らない猫トイレ', '猫 トイレ 砂 飛び散り防止 マット 猫トイレマット 砂取りマット', '猫トイレ フルカバー 飛び散り防止'],
    ['コアラマットレス', 'コアラマットレス保護カバー マットレスプロテクター シングル', 'コアラマットレス オリジナル シングル']
  ];
  for (const [query, accessory, product] of cases) {
    assert.equal(headNounScore(query, accessory), 0);
    assert.deepEqual(applyHeadNounGate(query, [{product_name:accessory}]), []);
    assert.deepEqual(applyHeadNounGate(query, [{product_name:accessory},{product_name:product}]), [{product_name:product}]);
  }
  const mat={product_name:'猫トイレマット 砂取りマット'};
  assert.deepEqual(applyHeadNounGate('猫トイレマット', [mat]), [mat]);
  const cover={product_name:'コアラマットレス保護カバー'};
  assert.deepEqual(applyHeadNounGate('マットレス カバー', [cover]), [cover]);
  const bag={product_name:'シューズバッグ メッシュ 速乾 上履き 収納'};
  assert.deepEqual(applyHeadNounGate('すぐ乾く上履き', [bag]), []);
  assert.deepEqual(applyHeadNounGate('上履き シューズバッグ', [bag]), [bag]);
});

// 2026-09-03 検索品質カナリア初回(9件中7件がカテゴリ違い)への汎用対策。
// 個別商品ルールではなく、検索文の主名詞が商品そのものとして出ているかで判定する。

test('主名詞は検索文の末尾から取り、辞書名詞で終わる語は強・弱の2段にする', () => {
  assert.deepEqual(extractHeadNouns('自立する本革トートバッグ').map((h) => h.term), ['トートバッグ', 'バッグ']);
  assert.deepEqual(extractHeadNouns('コアラマットレス').map((h) => h.term), ['コアラマットレス', 'マットレス']);
  assert.deepEqual(extractHeadNouns('韓国コスメ ピンク リップ').map((h) => h.term), ['リップ']);
  assert.deepEqual(extractHeadNouns('収納用品').map((h) => h.term), ['収納']);
  assert.deepEqual(extractHeadNouns('スモーキークォーツ リング').map((h) => h.term), ['リング']);
  assert.deepEqual(extractHeadNouns('白いバッグが欲しい').map((h) => h.term), ['バッグ']);
  assert.deepEqual(extractHeadNouns('この靴に似たもの').map((h) => h.term), ['靴']);
  assert.deepEqual(extractHeadNouns('これ'), []);
});

test('カテゴリ違い・別語の一部・付属品・枚数入りを弾き、本命は通す', () => {
  const cases = [
    ['コアラマットレス', 'コアラ Tシャツ アニマル（ コアラ ファン ） 男性 女性 マットレス マーチ', 0],
    ['コアラマットレス', 'コアラマットレス オリジナル シングル', 2],
    ['韓国コスメ ピンク リップ', '【即納】 94601-13000 ホンダ純正 ピストンピンクリップ JP店', 0],
    ['韓国コスメ ピンク リップ', 'ロムアンド ジューシーラスティングティント ピンク', 2],
    ['韓国リップ', 'ロート製薬 メンソレータム ウォーターリップ（無香料） 4.5g', 2],
    ['自立する本革トートバッグ', '2個セット バッグ ハンドルカバー かごバッグ ハンドル カバー 持ち手 トートバッグ レザー 本革', 0],
    ['自立する本革トートバッグ', '本革 トートバッグ 自立 A4 レディース 牛革', 2],
    ['自立する本革トートバッグ', '本革 長財布 メンズ', 0],
    ['自立する本革トートバッグ', 'レザー バッグ レディース A4 自立 通勤', 1],
    ['スモーキークォーツ リング', 'スモーキークォーツ ローズカット リング シルバー 925 指輪', 2],
    ['スモーキークォーツ リング', 'スモーキークォーツ イヤリング 天然石', 0],
    ['白いバッグ', 'ベルベ（bellbe） シティバッグ S 4193 白 10枚入', 0],
    ['白いバッグ', 'ショルダーバッグ レディース 白 ホワイト 斜めがけ', 2],
    ['ワンピース', 'エステー ムシューダ 防虫カバー 1年間有効 衣類 防虫剤 コート・ワンピース用 3枚', 0],
    ['ワンピース', 'ロングワンピース レディース 夏 半袖', 2],
    ['収納用品', '2026年NEWチップ搭載 【Amazon Fire TV Stick用】リモコン 交換用 Alexa 4K', 0],
    ['収納用品', '収納ボックス 折りたたみ 3個セット', 2],
    ['マットレス', '【厚さ5cm三つ折りバランスシングルマットレス95N-140N-95N】腰を支える', 2],
    ['iPhone 15 Pro ケース', 'iPhone 15 Pro ケース 耐衝撃 クリア', 2],
    ['マスク', '不織布マスク 50枚入 ふつうサイズ', 2],
    ['ハンディファン', '携帯扇風機 ハンディファン 手持ち 卓上', 2],
    // 2026-09-03 2回目カナリアの実例: 主名詞が形状の修飾語(ワンピース お玉)
    ['SHEINで見たワンピース', 'パール金属 Easy Fit ワンピース お玉 大 G-3131', 0],
    ['ワンピース', 'ワンピース レディース ロング 秋 長袖 きれいめ', 2],
    ['白いバッグ', 'BA112#ミニショルダーバッグ レザーバッグレディース お洒落 白', 2],
    ['自立する本革トートバッグ', 'ミニトートバッグ レディース おしゃれ 革 レザー 小さめ 軽い 手提げバッグ サブバッグ エコバッグ', 2],
    ['コアラマットレス', 'コアラリフレッシュピロー 枕 koala コアラマットレス 低反発 定価1万6000円 中古', 2]
  ];
  for (const [query, title, expected] of cases) {
    assert.equal(headNounScore(query, title), expected, `${query} => ${title}`);
  }
});

test('ゲートは本命を前に出し、一致ゼロなら元の順序を保って空にしない', () => {
  const candidates = [
    { product_name: 'コアラ Tシャツ アニマル マットレス マーチ' },
    { product_name: 'コアラマットレス オリジナル シングル' },
    { product_name: 'マットレス シングル 三つ折り' }
  ];
  assert.deepEqual(applyHeadNounGate('コアラマットレス', candidates).map((c) => c.product_name),
    ['コアラマットレス オリジナル シングル', 'マットレス シングル 三つ折り']);
  const unrelated = [{ product_name: 'A' }, { product_name: 'B' }];
  assert.deepEqual(applyHeadNounGate('コアラマットレス', unrelated), unrelated);
  assert.deepEqual(applyHeadNounGate('これ', candidates), candidates);
  assert.deepEqual(applyHeadNounGate('コアラマットレス', [candidates[0]]), [candidates[0]], '1件だけなら触らない');
  // 同じスコアなら主名詞が商品名の前半にある候補(商品そのもの)を、後半にしか
  // 出ない候補(ブランド名として出るだけ)より前へ。
  const koala = [
    { product_name: 'コアラリフレッシュピロー 枕 koala コアラマットレス 低反発 定価1万6000円 中古' },
    { product_name: 'コアラマットレス オリジナル シングル 中古' }
  ];
  assert.deepEqual(applyHeadNounGate('コアラマットレス', koala).map((c) => c.product_name),
    ['コアラマットレス オリジナル シングル 中古', 'コアラリフレッシュピロー 枕 koala コアラマットレス 低反発 定価1万6000円 中古']);
});

// 2026-09-18 大隆さん指示 P0-3: ひらがなで終わる主名詞(こたつ)と、主名詞に直接くっついた付属品語
// (こたつ毛布・こたつ布団・こたつカバー)を区別する。本体を表す語(こたつテーブル)は商品そのもの。
test('ひらがなの主名詞「こたつ」を取り、こたつ毛布・布団・カバーは付属品として本体から外す', () => {
  const query = '電気代が気にならないこたつ';
  assert.deepEqual(extractHeadNouns(query).map((h) => h.term), ['こたつ']);
  assert.deepEqual(extractHeadNouns('節電できる省エネこたつ').map((h) => h.term), ['こたつ']);
  assert.deepEqual(extractHeadNouns('欲しいものがある'), []);
  for (const [title, score] of [
    ['こたつ中掛け毛布 長方形 185×235cm フランネル こたつ毛布 こたつカバー 中掛け 毛布 こたつ布団', 0],
    ['こたつ布団 セット 長方形', 0],
    ['こたつカバー 上掛け', 0],
    ['こたつ用 継ぎ脚', 0],
    ['こたつ 長方形 105×75cm 省エネ こたつテーブル', 2],
    ['こたつテーブル 長方形 120cm', 2],
    ['電気こたつ 一人用 省エネ', 2],
    ['コタツ 正方形 75cm ヒーター 省エネ', 2],
    ['省エネ こたつ 掛け布団付き', 2]
  ]) assert.equal(headNounScore(query, title), score, title);
  const body = { product_name: 'こたつ 長方形 省エネ こたつテーブル' };
  const blanket = { product_name: 'こたつ中掛け毛布 フランネル こたつ毛布' };
  assert.deepEqual(applyHeadNounGate(query, [blanket, body]), [body]);
  // 既存の主名詞でも、直接くっついた付属品語は付属品(マットレスカバー・リングケース)。本体語は残す。
  assert.equal(headNounScore('コアラマットレス', 'コアラマットレスカバー シングル'), 0);
  assert.equal(headNounScore('スモーキークォーツ リング', 'リングケース 木製'), 0);
  assert.equal(headNounScore('SHEINで見たワンピース', 'ワンピースセット 2点 春'), 2);
});

// 2026-10-07 カナリア dark_ink_name_pen FAIL対応: 主名詞の末尾抽出は同一スクリプト区間
// (run)だけでなく末尾トークン全体(last)も辞書と照合する。「名前ペン」のように漢字+カタカナが
// 混在する複合語は run だと末尾カタカナの「ペン」しか取れず、汎用語「ペン」に一致する無関係な
// 商品(名入れボールペン)を主名詞一致(強)として拾っていた。辞書に「名前ペン」を登録し、長い
// 方を強い主名詞にすることで解消する。
test('「お名前ペン」は末尾の「ペン」単独ではなく複合語で強い主名詞を取り、名入れボールペン等を弾く', () => {
  const query = 'お名前ペンで書いた文字がすぐ薄くなって読めない 濃く書ける お名前ペン';
  assert.deepEqual(extractHeadNouns(query).map((h) => h.term), ['名前ペン', 'ペン']);
  for (const [title, score] of [
    // 2026-10-16: 弱い一致(1)でも本命に残ったため、別の複合語「ボールペン」の中の「ペン」は 0 に厳しくした
    ['名入れ パイロット PILOT ボールペン アクロ1000 ブラック油性ボールペン', 0],
    ['濃く書ける お名前ペン 極細 太字 2本セット 布用 油性', 2],
    ['シヤチハタ お名前ペン にじまない 布用 太字', 2]
  ]) assert.equal(headNounScore(query, title), score, title);
  const genericPen = { product_name: '名入れ パイロット PILOT ボールペン アクロ1000 ブラック油性ボールペン' };
  const namePen = { product_name: '濃く書ける お名前ペン 極細 太字 2本セット 布用 油性' };
  assert.deepEqual(applyHeadNounGate(query, [genericPen, namePen]), [namePen]);
});

// 2026-10-16 固定QA(07:22〜07:24)の意味判定で見つかった2件(Codex)。特定の商品名・店名ではなく語の関係で判定する。
test('マットレス本体の検索でトッパーを本体扱いしない。トッパー検索・トッパー付き本体は残す', () => {
  const query = 'Instagramで見たマットレス';
  for (const [title, score] of [
    ['Queen Mattress Topper / 3 Inch / Memory Foam Bed Topper', 0],
    ['マットレス トッパー 3cm 高反発', 0],
    ['マットレストッパー シングル', 0],
    ['トッパー付きマットレス シングル', 2],
    ['マットレス シングル トッパー付き', 2],
    ['マットレストッパー付き 2層 シングル', 2],
    ['高反発マットレス シングル 厚さ10cm', 2],
    ['Napier Sportz Air Mattress', 2]
  ]) assert.equal(headNounScore(query, title), score, title);
  const topper = { product_name: 'Queen Mattress Topper / 3 Inch / Memory Foam Bed Topper' };
  const body = { product_name: '高反発マットレス シングル 厚さ10cm' };
  assert.deepEqual(applyHeadNounGate(query, [topper, body]), [body]);
  // トッパーを明示的に探す検索では、トッパーが残り本体は外れる
  for (const topperQuery of ['トッパー', 'マットレストッパー', 'mattress topper']) {
    assert.ok(headNounScore(topperQuery, topper.product_name) >= 1, topperQuery);
    assert.deepEqual(applyHeadNounGate(topperQuery, [body, topper]), [topper], topperQuery);
  }
});

// 2026-10-20 固定QA(07:23)の意味判定で見つかった1件(Codex)。ブランド名の Mattress で英語 Bed Frame を本体扱いしない。
test('マットレス本体の検索で英語のBed Frame商品を本体扱いしない。本体・ブランド入り本体・セット・フレーム検索は残す', () => {
  const query = 'Instagramで見たマットレス';
  const frame = { product_name: 'Best Price Mattress Twin Bed Frame 12 Soild Wood Platform Bed Frame w/CLASSIC Wo' };
  for (const [title, score] of [
    [frame.product_name, 0],
    ['Zinus 14 Inch Metal Platform Bed Frame with Wood Slat Support, Queen', 0],
    ['Best Price Mattress 10 Inch Memory Foam Mattress, Queen', 2],
    ['Best Price Mattress 8 Inch Pocket Spring Mattress, Twin', 2],
    ['Zinus 12 Inch Green Tea Memory Foam Mattress, Fits Any Bed Frame', 2],
    ['Twin Memory Foam Mattress for Platform Bed Frame, Medium Firm', 2],
    ['Queen Mattress, Bed Frame Not Included', 2],
    ['Platform Bed Frame with 10 Inch Mattress, Twin', 2],
    ['Full Size Bed Frame and Mattress Set', 2],
    ['Napier Sportz Air Mattress', 2],
    ['高反発マットレス シングル 厚さ10cm', 2],
    ['ベッドフレーム マットレス付き シングル', 2],
    ['コアラマットレス オリジナル シングル', 2]
  ]) assert.equal(headNounScore(query, title), score, title);
  // ブランド入りのコアラマットレス検索でも同じ判定
  assert.equal(headNounScore('コアラマットレス', 'Koala Mattress Platform Bed Frame Queen'), 0);
  assert.ok(headNounScore('コアラマットレス', 'Koala Mattress Original Queen') >= 1);
  // ゲート: 本体があればフレームは外れ、全件フレームなら空にせず元順序を保つ
  const body = { product_name: 'Best Price Mattress 10 Inch Memory Foam Mattress, Queen' };
  assert.deepEqual(applyHeadNounGate(query, [frame, body]), [body]);
  const frame2 = { product_name: 'Zinus 14 Inch Metal Platform Bed Frame with Wood Slat Support, Queen' };
  assert.deepEqual(applyHeadNounGate(query, [frame, frame2]), [frame, frame2]);
  // フレームだけの候補群は「一致なし」として次のキーワード候補へ進む
  assert.equal(hasHeadNounMatch(query, [frame, frame2]), false);
  assert.equal(hasHeadNounMatch(query, [frame, body]), true);
  // 検索文自体がフレームに触れている時は、このルールでは外さない(従来どおり)
  assert.equal(headNounScore('フレーム付きマットレス', frame.product_name), 2);
});

test('布用お名前ペンの検索で名入れボールペン・サインペンを弾き、通常のボールペン検索は壊さない', () => {
  const query = 'お名前ペンで書いた文字がすぐ薄くなって読めない 濃く書ける お名前ペン';
  const ballpoint = { product_name: '名入れ パイロット PILOT ボールペン アクロ1000 ブラック油性ボールペン' };
  const fabricPen = { product_name: '布用 油性ペン 太字 名前書き' };
  const namePen = { product_name: '濃く書ける お名前ペン 極細 太字 2本セット 布用 油性' };
  assert.equal(headNounScore(query, ballpoint.product_name), 0);
  assert.equal(headNounScore(query, 'サインペン 水性 10本'), 0);
  assert.equal(headNounScore(query, fabricPen.product_name), 1);
  assert.equal(headNounScore(query, namePen.product_name), 2);
  // 正しい布用ペンが弱い一致しか無くても、名入れボールペンより前に出て、ボールペンは外れる
  assert.deepEqual(applyHeadNounGate(query, [ballpoint, fabricPen]), [fabricPen]);
  assert.deepEqual(applyHeadNounGate(query, [ballpoint, namePen, fabricPen]), [namePen, fabricPen]);
  // 通常のボールペン・ペン検索ではボールペンは商品そのもの
  for (const penQuery of ['ボールペン', '書きやすいボールペン', 'かわいいペン']) {
    assert.equal(headNounScore(penQuery, 'ジェットストリーム ボールペン 0.5'), 2, penQuery);
  }
});

// 2026-10-28 受信箱 appliance-accessory-exclusion: 固定QA oil_free_air_fryer / energy_saving_kotatsu
test('家電本体(ノンフライヤー/こたつ)の検索でライナー・ダクト等の付属品を本命にせず、全件付属品でも再昇格しない', async () => {
  const { headNounGateQueryFor } = await import('../src/query-expansion.mjs');
  const fryerQuery = headNounGateQueryFor('油を使わずに唐揚げが作れる調理家電');
  const kotatsuQuery = headNounGateQueryFor('電気代が気にならないこたつ');
  const liner = { product_name: '山崎実業 タワー ノンフライヤーライナー21cm／シリコンシート' };
  const duct = { product_name: 'こたつ省エネダクト・温風ヒーター用パイプ fbp-1080w' };
  const fryer = { product_name: 'COSORI ノンフライヤー 4.7L エアフライヤー 電気フライヤー' };
  const fryerWithLiner = { product_name: 'ノンフライヤー 5L 電気フライヤー ペーパーライナー付き' };
  const kotatsu = { product_name: '山善 こたつ テーブル 80cm 正方形 省エネ' };
  const kotatsuAttached = { product_name: '家具調こたつテーブル 105×75 長方形' };
  // 付属品は主名詞スコア0、本体は2
  assert.equal(headNounScore(fryerQuery, liner.product_name), 0);
  assert.equal(headNounScore(kotatsuQuery, duct.product_name), 0);
  assert.equal(headNounScore(fryerQuery, fryer.product_name), 2);
  assert.equal(headNounScore(fryerQuery, fryerWithLiner.product_name), 2);
  assert.equal(headNounScore(kotatsuQuery, kotatsu.product_name), 2);
  assert.equal(headNounScore(kotatsuQuery, kotatsuAttached.product_name), 2);
  // 本体があれば付属品は外れ、本体が本命
  assert.deepEqual(applyHeadNounGate(fryerQuery, [liner, fryer]), [fryer]);
  assert.deepEqual(applyHeadNounGate(kotatsuQuery, [duct, kotatsu]), [kotatsu]);
  // 全候補不適合(付属品のみ)は元順序フォールバックで本命に戻さない(適合候補なし)
  assert.deepEqual(applyHeadNounGate(fryerQuery, [liner]), []);
  assert.deepEqual(applyHeadNounGate(kotatsuQuery, [duct, { product_name: 'こたつ 省エネ ダクト 温風 パイプ' }]), []);
  assert.equal(hasHeadNounMatch(fryerQuery, [liner]), false);
  assert.equal(hasHeadNounMatch(kotatsuQuery, [duct]), false);
  // 付属品を明示した検索は維持
  assert.deepEqual(applyHeadNounGate('ノンフライヤー ライナー', [liner]), [liner]);
  assert.deepEqual(applyHeadNounGate('ノンフライヤー用シリコンシート', [liner]), [liner]);
  assert.deepEqual(applyHeadNounGate('こたつ ダクト', [duct]), [duct]);
  assert.deepEqual(applyHeadNounGate('こたつ用 温風パイプ', [duct]), [duct]);
});
