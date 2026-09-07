import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHeadNounGate, extractHeadNouns, headNounScore } from '../src/search-head-noun.mjs';

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
