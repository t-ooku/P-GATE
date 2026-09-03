// 汎用の「主名詞ゲート」(2026-09-03, 指示書 §10/§11)。
//
// 個別商品ごとのルールを増やさずに、検索文の末尾にある商品の主名詞
// (「自立する本革トートバッグ」→「トートバッグ」、「韓国リップ」→「リップ」)
// が、候補の商品名に「商品そのもの」として現れているかを判定し、
//   - 現れていない候補(コアラマットレス → コアラのTシャツ)
//   - 別語の一部として現れる候補(リップ → ピストンピン「クリップ」)
//   - 付属品・用途表記として現れる候補(ワンピース「用」防虫カバー、
//     トートバッグの「ハンドルカバー」)
//   - 枚数入りの消耗品(紙袋 10枚入)
// を後ろへ回す。一致する候補が1件も無い時は元の順序を保ち、空にはしない。

const PRODUCT_HEADS = Object.freeze([
  // バッグ・小物
  'バッグ', 'リュック', 'ポーチ', '財布', 'キーケース', 'キーホルダー', 'カードケース', 'ベルト', 'ハンカチ', 'タオル',
  // 衣類・靴
  'ワンピース', 'スカート', 'パンツ', 'デニム', 'ジーンズ', 'シャツ', 'ブラウス', 'ニット', 'セーター', 'カーディガン', 'パーカー', 'トレーナー',
  'ジャケット', 'コート', 'ダウン', 'ベスト', 'ドレス', '水着', '靴下', 'ソックス', 'タイツ', '帽子', 'キャップ', 'マフラー', 'ストール', '手袋',
  'スニーカー', 'サンダル', 'ブーツ', 'パンプス', 'ローファー', 'スリッパ', '靴',
  // アクセサリー
  'リング', '指輪', 'ネックレス', 'ピアス', 'イヤリング', 'ブレスレット', 'バングル', 'アンクレット', 'ヘアゴム', 'ヘアクリップ', 'ヘアピン', '腕時計', '時計',
  // コスメ
  'リップ', 'ティント', 'グロス', 'ファンデーション', 'ファンデ', 'アイシャドウ', 'マスカラ', 'アイライナー', 'チーク', 'ハイライト', 'コンシーラー',
  '下地', '化粧水', '乳液', '美容液', 'クリーム', 'パック', 'シートマスク', '日焼け止め', '香水', 'シャンプー', 'トリートメント', 'ヘアオイル', 'ネイル',
  // 家具・寝具・生活
  'マットレス', '枕', '布団', '毛布', 'シーツ', 'ソファ', 'テーブル', 'デスク', 'チェア', '椅子', 'ラック', '棚', 'ボックス', 'ケース', 'カゴ', 'かご',
  'ハンガー', 'カーテン', 'ラグ', 'カーペット', 'クッション', 'ミラー', '鏡', '照明', 'ライト', 'ランプ', '加湿器', '扇風機', 'ファン', 'ヒーター',
  '水筒', 'タンブラー', 'マグカップ', 'ボトル', '弁当箱', 'フライパン', '鍋', '包丁', 'まな板', '食器', '皿', '傘', '収納', 'ピロー',
  // 台所用品(「ワンピース お玉」のように衣類語が形状の修飾語になる商品を見分ける)
  'お玉', 'おたま', 'ヘラ', 'トング', 'ザル', 'ボウル', 'スプーン', 'フォーク', '箸', '菜箸', '泡立て器', 'ピーラー', 'おろし器',
  '計量カップ', '保存容器', 'タッパー', '水切り', '鍋敷き', '鍋つかみ', 'エプロン', 'ふきん', 'スポンジ', 'キッチンペーパー', 'ゴミ箱', '洗剤',
  // 家電・ガジェット
  'イヤホン', 'ヘッドホン', 'スピーカー', 'カメラ', 'プリンター', 'モニター', 'キーボード', 'マウス', '充電器', 'ケーブル', 'バッテリー', 'スマホケース',
  'ドライヤー', 'アイロン', 'ヘアアイロン', '掃除機', '炊飯器', 'トースター', 'ケトル', 'ブレンダー', 'ミキサー', 'テレビ', 'タブレット', 'スマートウォッチ',
  // 食品・その他
  'キムチ', 'コーヒー', '紅茶', 'お茶', 'チョコレート', 'クッキー', 'グミ', 'サプリ', 'プロテイン', 'おもちゃ', 'ぬいぐるみ', 'フィギュア', '文房具', 'ノート', 'ペン',
  'マスク', 'ステッカー', 'シール', 'クリップ', 'カバー', 'ホルダー', 'スタンド', 'リモコン', 'Tシャツ'
]);
const HEAD_ALIASES = Object.freeze({
  '指輪': ['リング'], 'リング': ['指輪'], '靴': ['スニーカー', 'シューズ', 'サンダル', 'ブーツ', 'パンプス'], 'ワンピース': ['ワンピ'],
  '椅子': ['チェア'], 'チェア': ['椅子'], '鏡': ['ミラー'], 'ミラー': ['鏡'], '収納': ['収納ケース', '収納ボックス', '収納ラック'],
  'ファンデ': ['ファンデーション'], '時計': ['ウォッチ', '腕時計'], 'ライト': ['ランプ', '照明'], 'マグカップ': ['マグ'],
  'キムチ': ['kimchi'], 'リップ': ['ティント', 'リップスティック', 'リップグロス', 'リップバーム'], '枕': ['ピロー'], 'ピロー': ['枕']
});
// 主名詞が別の語の一部として現れる誤一致(リップ→クリップ)。
const FALSE_FRIENDS = Object.freeze({
  'リップ': ['クリップ', 'グリップ', 'スリップ', 'チューリップ', 'フィリップ', 'ストリップ'],
  'リング': ['イヤリング', 'ストリング', 'スプリング', 'モニタリング', 'ハンドリング', 'ケータリング', 'カラーリング', 'クリアリング', 'ヒーリング'],
  'バッグ': ['エアバッグ', 'サンドバッグ', 'ティーバッグ'],
  'ケース': ['ショーケース', 'スーツケース', 'ブックケース'],
  'マスク': ['アイマスク', 'フェイスマスク', 'パックマスク'],
  'ファン': ['ファンデーション', 'ファンデ', 'ファンヒーター'],
  'ライト': ['ハイライト', 'フライト', 'サテライト'],
  'パンツ': ['ショートパンツ', 'ハーフパンツ'],
  'カバー': [], 'ホルダー': [], 'クリップ': ['ヘアクリップ']
});
const ACCESSORY_WORDS = /(?:カバー|ケース|ホルダー|スタンド|リモコン|交換用|替え|パーツ|部品|フィルム|保護|専用|対応|用品|ハンガー|収納袋|ストラップ)/u;
const PACKAGING = /\d+\s*(?:枚|枚入り?|枚セット|枚組)/u;
const PACKAGING_OK_HEADS = new Set(['マスク', 'シートマスク', 'タオル', 'ハンカチ', '靴下', 'ソックス', 'シール', 'ステッカー', 'ノート', 'パック', 'シーツ', 'フィルム']);
const TRAILING_PHRASES = /(?:\s*(?:が|を|の)?\s*(?:欲しい|ほしい|探して(?:い)?(?:る|ます)?|探したい|買いたい|見つけたい|ください|下さい|お願いします|教えて(?:ください)?|ありますか|ある[?？]?)|\s*(?:みたいな|っぽい|のような|に似た|に近い|風の|系の)\s*(?:やつ|もの|の|商品|アイテム)?|\s*(?:やつ|もの|商品|アイテム|これ|あれ|それ))+[。！!?？\s]*$/u;

const KATAKANA = /[\p{Script=Katakana}ー]/u;

function normalize(text) {
  return String(text || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

// 検索文の末尾から主名詞を取り出す。末尾のカタカナ列/漢字列を見て、辞書の
// 名詞で終わっていればそれを弱い主名詞、列全体を強い主名詞とする。
export function extractHeadNouns(query) {
  let text = normalize(query).replace(TRAILING_PHRASES, '').trim();
  if (!text) return [];
  const last = text.split(/[\s、,／/]+/u).filter(Boolean).pop() || '';
  const run = last.match(/([\p{Script=Katakana}ー]{2,}|[\p{Script=Han}]{1,6}|[A-Za-z][A-Za-z0-9-]{2,})$/u)?.[1] || '';
  if (!run) return [];
  const heads = [];
  const dictionary = PRODUCT_HEADS.filter((noun) => run.endsWith(noun)).sort((a, b) => b.length - a.length);
  const dictionaryHead = dictionary[0] || '';
  if (dictionaryHead && dictionaryHead !== run) {
    heads.push({ term: run, strength: 2 });
    heads.push({ term: dictionaryHead, strength: 1 });
  } else if (dictionaryHead) {
    heads.push({ term: dictionaryHead, strength: 2 });
  } else if (KATAKANA.test(run) && run.length >= 3) {
    heads.push({ term: run, strength: 2 });
  } else if (!KATAKANA.test(run) && run.length >= 2 && /^[\p{Script=Han}]+$/u.test(run)) {
    // 辞書外の漢字語(「収納用品」→「収納」)は「用品/グッズ/セット」を外して使う。
    const stripped = run.replace(/(?:用品|グッズ|アイテム|セット|一式)$/u, '');
    if (stripped.length >= 2) heads.push({ term: stripped, strength: 2 });
  }
  return heads;
}

const TOKEN_SPLIT = /[\s、,／/・【】\[\]()（）「」『』〈〉《》|｜]+/u;

// 商品名の語(トークン)が辞書の商品名詞で終わっていればその名詞を返す。
function productNounOfToken(token) {
  const value = String(token || '');
  if (!value) return '';
  return PRODUCT_HEADS.filter((noun) => value.endsWith(noun)).sort((a, b) => b.length - a.length)[0] || '';
}

function relatedToHeads(noun, headTerms) {
  return headTerms.has(noun) || [...headTerms].some((term) => term.includes(noun) || noun.includes(term));
}

function occurrenceIsClean(title, head, index, headTerms = new Set([head])) {
  const before = title.slice(0, index);
  const after = title.slice(index + head.length);
  // 付属品・用途表記(「ワンピース用」「〜対応」)
  if (/^\s*(?:用|対応|向け|専用)/u.test(after)) return false;
  // 別語の一部(リップ → クリップ)
  const falseFriends = FALSE_FRIENDS[head] || [];
  if (falseFriends.length) {
    const runStart = before.search(/[\p{Script=Katakana}ー]+$/u);
    const runEnd = after.search(/[^\p{Script=Katakana}ー]/u);
    const word = `${runStart === -1 ? '' : before.slice(runStart)}${head}${runEnd === -1 ? after : after.slice(0, runEnd)}`;
    if (falseFriends.some((friend) => word.endsWith(friend) || word === friend)) return false;
  }
  // 短い別名(ワンピ)が長い主名詞(ワンピース)の一部として出ているだけなら、
  // 判定は長い方の出現に任せる(ここでは一致扱いにしない)。
  if ([...headTerms].some((term) => term !== head && term.startsWith(head) && after.startsWith(term.slice(head.length)))) return false;
  // 主名詞の直後に別の商品名詞が来る(「ワンピース お玉」= 一体型のお玉)なら、
  // 主名詞は形状・種類の修飾語であって商品そのものではない。
  if (/^\s/u.test(after)) {
    const nextToken = after.trim().split(TOKEN_SPLIT)[0] || '';
    const nextNoun = productNounOfToken(nextToken);
    if (nextNoun && !relatedToHeads(nextNoun, headTerms) && !ACCESSORY_WORDS.test(nextNoun)) return false;
  }
  return true;
}

export function headNounScore(query, title, heads = extractHeadNouns(query)) {
  return headNounDetail(query, title, heads).score;
}

// score: 2=商品そのもの / 1=弱い一致 / 0=カテゴリ違い・付属品 / null=主名詞なし。
// position: 主名詞が商品名のどの位置にあるか(0=前半、1=後半)。同じスコア内の
// 並び順にだけ使う(「コアラリフレッシュピロー 枕 … コアラマットレス」より
// 「コアラマットレス オリジナル」を前へ)。
export function headNounDetail(query, title, heads = extractHeadNouns(query)) {
  if (!heads.length) return { score: null, position: 0 };
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return { score: 0, position: 1 };
  const normalizedQuery = normalize(query);
  const queryHasAccessory = ACCESSORY_WORDS.test(normalizedQuery);
  const packaged = PACKAGING.test(normalizedTitle)
    && !heads.some(({ term }) => PACKAGING_OK_HEADS.has(term)) && !PACKAGING.test(normalizedQuery);
  const headTerms = new Set(heads.flatMap(({ term }) => [term, ...(HEAD_ALIASES[term] || [])]));
  const positionOf = (index) => (index <= Math.max(12, Math.floor(normalizedTitle.length / 3)) ? 0 : 1);
  const evaluate = (term) => {
    let seen = false;
    for (const candidate of [term, ...(HEAD_ALIASES[term] || [])]) {
      let index = normalizedTitle.indexOf(candidate);
      while (index !== -1) {
        seen = true;
        if (occurrenceIsClean(normalizedTitle, candidate, index, headTerms)) {
          const before = normalizedTitle.slice(0, index);
          // 主名詞より前に付属品語が出る商品名(「ハンドルカバー … トートバッグ」)は
          // 付属品とみなす。検索文自体が付属品を求めている時は除外しない。
          const accessoryFirst = !queryHasAccessory && ACCESSORY_WORDS.test(before)
            && !ACCESSORY_WORDS.test(candidate);
          if (!accessoryFirst) return { matched: true, index };
        }
        index = normalizedTitle.indexOf(candidate, index + 1);
      }
    }
    return { matched: false, seen, index: -1 };
  };
  const strong = heads.find(({ strength }) => strength === 2);
  const weak = heads.find(({ strength }) => strength === 1);
  const strongResult = strong ? evaluate(strong.term) : { matched: false, seen: false, index: -1 };
  if (strongResult.matched) return { score: packaged ? 0 : 2, position: positionOf(strongResult.index) };
  // 強い主名詞が商品名に出ていながら付属品・別語だった候補は、弱い主名詞
  // (「バッグ」)が別の場所にあっても救わない。
  if (strongResult.seen) return { score: 0, position: 1 };
  if (!weak) return { score: 0, position: 1 };
  const weakResult = evaluate(weak.term);
  if (!weakResult.matched || packaged) return { score: 0, position: 1 };
  // 弱い一致は、商品名でそれより前に別の商品名詞(「コアラ Tシャツ … マットレス」)
  // が出ていれば、その商品はそちらだとみなす。
  const earlierOther = PRODUCT_HEADS.some((noun) => {
    if (ACCESSORY_WORDS.test(noun) || relatedToHeads(noun, headTerms)) return false;
    const index = normalizedTitle.indexOf(noun);
    return index !== -1 && index < weakResult.index;
  });
  return { score: earlierOther ? 0 : 1, position: positionOf(weakResult.index) };
}

export function applyHeadNounGate(query, candidates = [], { titleOf = defaultTitle } = {}) {
  const heads = extractHeadNouns(query);
  const list = Array.isArray(candidates) ? candidates : [];
  if (!heads.length || list.length < 2) return list;
  const scored = list.map((candidate, index) => ({
    candidate, index, ...headNounDetail(query, titleOf(candidate), heads)
  }));
  if (!scored.some(({ score }) => score > 0)) return list;
  return scored
    .sort((a, b) => b.score - a.score || a.position - b.position || a.index - b.index)
    .filter(({ score }) => score > 0)
    .map(({ candidate }) => candidate);
}

function defaultTitle(candidate) {
  return String(candidate?.product_name || candidate?.display_name || candidate?.name || candidate?.title || '');
}

export const searchHeadNounTest = Object.freeze({ PRODUCT_HEADS, occurrenceIsClean });
