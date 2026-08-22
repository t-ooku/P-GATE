// 検索語からの「横展開」レコメンド。
//
// ユーザー指示(2026-08-18):
//   「レコメンド提示が、検索された商品がそのまま提示されてる
//    → 関連商品を提示して。『天然石 ピアス』検索してるなら、
//      『天然石 指輪』『シルバー ピアス』とか、検索された商品からの
//      横展開を提示するイメージ」
//
// 既存の related-product-recommendations.mjs は「一緒に使うもの」
// (ピアス→アクセサリーケース、ピアスキャッチ)を返す設計で、AIプロンプトにも
// 「別ブランド・別モデルは薦めるな」と明記されている。求められているのは
// その逆なので、別モジュールとして横展開を用意し、こちらを優先する。
//
// 考え方: 検索語を「修飾語（素材・色など）」と「商品名詞」に分解し、
//   (1) 修飾語はそのままに、同じ系統の別アイテムへ振る  天然石 ピアス → 天然石 指輪
//   (2) 商品名詞はそのままに、同じ系統の別の修飾語へ振る 天然石 ピアス → シルバー ピアス
// の2軸で候補語を作る。
//
// ここで作るのは「検索語」だけで、商品・価格・在庫は一切作らない。
// 生成した検索語は呼び出し側(handleRelatedRecommendationsApi)がモールAPIで
// 実在確認し、確認できた商品だけが表示される。存在しない組み合わせは
// 自然に0件になって消えるので、誤った商品を見せることにはならない。

// 商品名詞の系統。同じ配列内が「横に並ぶ別アイテム」。
// 語は日本のモール検索で実際に使われる一般的な語に限定する。
const PRODUCT_FAMILIES = [
  ['ピアス', 'イヤリング', 'ネックレス', '指輪', 'リング', 'ブレスレット', 'アンクレット', 'チョーカー'],
  ['ブラウス', 'シャツ', 'カットソー', 'Tシャツ', 'ニット', 'カーディガン', 'ベスト', 'チュニック'],
  ['スカート', 'パンツ', 'ジーンズ', 'デニム', 'ワイドパンツ', 'ショートパンツ', 'レギンス'],
  ['ワンピース', 'ジャンパースカート', 'オールインワン', 'セットアップ'],
  ['ジャケット', 'コート', 'ブルゾン', 'パーカー', 'カーディガン'],
  ['スニーカー', 'パンプス', 'サンダル', 'ブーツ', 'ローファー', 'バレエシューズ'],
  ['トートバッグ', 'ショルダーバッグ', 'リュック', 'ハンドバッグ', 'ボディバッグ', 'クラッチバッグ'],
  ['帽子', 'キャップ', 'ハット', 'ニット帽', 'ベレー帽'],
  ['財布', '長財布', '折り財布', 'カードケース', 'キーケース'],
  ['腕時計', 'スマートウォッチ'],
  // カラコン/コンタクトレンズ/カラーコンタクトは横に並ぶ「別アイテム」では
  // なく同義語なので、ここには入れない。横展開すると「カラコン」の隣に
  // 「コンタクトレンズ」が出るだけで情報量がない。この語は
  // related-product-recommendations.mjs 側の補完提案(洗浄液・ケース・装着液)
  // に任せたほうが利用者の役に立つ。
  ['化粧水', '乳液', '美容液', 'クリーム', '洗顔料', 'クレンジング', 'パック'],
  ['ファンデーション', 'コンシーラー', 'アイシャドウ', 'リップ', 'チーク', 'マスカラ', 'アイライナー'],
  ['シャンプー', 'コンディショナー', 'トリートメント', 'ヘアオイル', 'ヘアミルク'],
  ['収納ケース', '収納ボックス', '収納ラック', '衣装ケース', '突っ張り棚'],
  ['保存容器', 'タッパー', '弁当箱', '水筒', 'タンブラー', 'マグカップ'],
  ['フライパン', '鍋', '片手鍋', 'ケトル', 'まな板'],
  ['枕', '掛け布団', '敷きパッド', 'ベッドシーツ', '毛布', 'ブランケット'],
  // マットレスを寝具アクセサリーと同じ系統に入れると、
  // 本体を探している利用者にシーツが優先表示される。
  // 本体の構造・硬さの別候補だけを同一ファミリーとする。
  ['マットレス', 'ポケットコイルマットレス', '高反発マットレス', '低反発マットレス'],
  ['イヤホン', 'ヘッドホン', 'スピーカー'],
  ['スマホケース', 'スマホショルダー', 'スマホリング', 'モバイルバッテリー'],
  ['ノートパソコン', 'タブレット', 'キーボード', 'マウス'],
  ['除湿機', '加湿器', '空気清浄機', 'サーキュレーター', '扇風機'],
  ['ドッグフード', 'キャットフード', 'ペットベッド', 'ペット用おもちゃ', '猫砂']
];

// 修飾語の系統。
//
// swappable=true の系統だけが「アイテムを保ったまま別の修飾語へ振る」軸に
// 使われる。素材や色は入れ替えても自然だが、季節・用途の語は系統内が
// 互いに排他的で、入れ替えると矛盾した提案になる(「涼しいブラウス」を
// 探している人に「暖かいブラウス」を出してしまう)。そういう語は
// 「修飾語を保ったまま別アイテムへ」の軸にだけ使う。
const MODIFIER_FAMILIES = [
  { swappable: true, values: ['天然石', 'シルバー', 'ゴールド', 'パール', 'チタン', 'ステンレス', 'レザー', 'コットン', 'リネン'] },
  { swappable: true, values: ['白', '黒', 'ベージュ', 'ネイビー', 'グレー', 'ピンク', 'ブラウン', 'カーキ'] },
  { swappable: false, values: ['涼しい', '暖かい', '防水', '軽量', '折りたたみ', '大容量'] }
];

const NOUN_INDEX = new Map();
for (const family of PRODUCT_FAMILIES) {
  for (const noun of family) {
    // 同じ語が複数系統に出る場合(カーディガンなど)は先勝ちにする。
    if (!NOUN_INDEX.has(noun)) NOUN_INDEX.set(noun, family);
  }
}
const MODIFIER_INDEX = new Map();
for (const family of MODIFIER_FAMILIES) {
  for (const modifier of family.values) {
    if (!MODIFIER_INDEX.has(modifier)) MODIFIER_INDEX.set(modifier, family);
  }
}

function normalize(value) {
  return String(value || '').normalize('NFKC').replace(/[#＃]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

// 検索語から商品名詞と修飾語を拾う。トークン分割だけでは
// 「天然石ピアス」のような無空白の入力を取りこぼすので、部分一致も見る。
function detect(query) {
  const source = normalize(query);
  if (!source) return { noun: '', nounFamily: null, modifier: '', modifierFamily: null };
  const lower = source.toLocaleLowerCase();
  let noun = '';
  let nounFamily = null;
  // 長い語から先に照合する(「カラーコンタクト」が「コンタクトレンズ」より
  // 先に当たるように、また「ニット帽」が「ニット」に食われないように)。
  for (const candidate of [...NOUN_INDEX.keys()].sort((a, b) => b.length - a.length)) {
    if (lower.includes(candidate.toLocaleLowerCase())) {
      noun = candidate;
      nounFamily = NOUN_INDEX.get(candidate);
      break;
    }
  }
  let modifier = '';
  let modifierFamily = null;
  for (const candidate of [...MODIFIER_INDEX.keys()].sort((a, b) => b.length - a.length)) {
    if (lower.includes(candidate.toLocaleLowerCase())) {
      modifier = candidate;
      modifierFamily = MODIFIER_INDEX.get(candidate);
      break;
    }
  }
  return { noun, nounFamily, modifier, modifierFamily };
}

const REASONS = {
  JA: {
    sameModifier: (modifier) => `同じ「${modifier}」の別アイテム`,
    sameNoun: (noun) => `同じ「${noun}」の別の選び方`,
    sibling: (noun) => `「${noun}」と一緒に見られているアイテム`
  },
  EN: {
    sameModifier: (modifier) => `Other items in "${modifier}"`,
    sameNoun: (noun) => `Other options for "${noun}"`,
    sibling: (noun) => `Often browsed alongside "${noun}"`
  },
  ZH: {
    sameModifier: (modifier) => `同为「${modifier}」的其他商品`,
    sameNoun: (noun) => `同类「${noun}」的其他选择`,
    sibling: (noun) => `与「${noun}」一起浏览的商品`
  },
  KO: {
    sameModifier: (modifier) => `같은 "${modifier}"의 다른 아이템`,
    sameNoun: (noun) => `같은 "${noun}"의 다른 선택`,
    sibling: (noun) => `"${noun}"과(와) 함께 보는 아이템`
  }
};

// 検索語からの横展開クエリを最大3件返す。該当しなければ空配列。
export function relatedProductExpansionQueries(rawQuery, language = 'JA') {
  const { noun, nounFamily, modifier, modifierFamily } = detect(rawQuery);
  if (!noun || !nounFamily) return [];
  const reasons = REASONS[language] || REASONS.JA;
  const original = normalize(rawQuery).toLocaleLowerCase();
  const seen = new Set();
  const out = [];

  const push = (query, reason) => {
    const value = normalize(query);
    const key = value.toLocaleLowerCase();
    if (!value || key === original || seen.has(key) || out.length >= 3) return;
    seen.add(key);
    out.push({ query: value, reason });
  };

  const siblingNouns = nounFamily.filter((item) => item !== noun);
  if (modifier) {
    // (1) 修飾語を保ったまま別アイテムへ: 天然石 ピアス → 天然石 指輪
    for (const sibling of siblingNouns.slice(0, 2)) {
      push(`${modifier} ${sibling}`, reasons.sameModifier(modifier));
    }
    // (2) アイテムを保ったまま別の修飾語へ: 天然石 ピアス → シルバー ピアス
    // 入れ替えて自然な系統(素材・色)に限る。季節・用途語は排他的なので使わない。
    const siblingModifiers = modifierFamily?.swappable
      ? modifierFamily.values.filter((item) => item !== modifier) : [];
    if (siblingModifiers.length) {
      push(`${siblingModifiers[0]} ${noun}`, reasons.sameNoun(noun));
    }
  }
  // 修飾語を拾えなかった、または枠が余った場合は同系統の別アイテムで埋める。
  for (const sibling of siblingNouns) {
    push(sibling, reasons.sibling(noun));
  }
  return out.slice(0, 3);
}

export const relatedProductExpansionTest = { detect, PRODUCT_FAMILIES, MODIFIER_FAMILIES };
