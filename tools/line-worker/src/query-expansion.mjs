// v4.2 項目1・2・3: 商品名を知らなくても探せる検索
//
// ユーザーは正式な商品名を知らずに検索することが多い（子ども・高齢者・外国人
// を重要な対象とする）。「顔用扇風機」のような口語的な説明文から、実在する
// 商品カテゴリの正式名詞（例:「ハンディファン」）へ展開する層。
//
// 設計方針（引継ぎ文書 v4.2 セクション5「調査結果」参照）:
// - クエリ全体を正式名詞へ「置き換える」のではなく、正式名詞を「先頭に追加」
//   する。ユーザーの修飾語（色・サイズ・「小さくてカバンに入る」等）を失わ
//   ない。
// - primary/synonym/related/broad の4段階の重みを持たせる。現時点で
//   handleKnowledgeApi へ実際に反映するのは primary のみ（クエリ本文へ合流
//   させる）。synonym 以下は将来のランキング調整・AI提示・関連キーワード
//   チップ表示のために保持しておくメタデータ。
// - 該当する規則が無ければ何もしない（安全側）。「名前が分からないけど透明
//   なやつ」のように曖昧すぎる入力を誤って展開しないこと自体がAI利用優先順位
//   （D1/Teacher Dataset → Search Knowledge/Cache → 解決できない検索だけAI）
//   の前提になる。
// - この層は完全にルールベースであり、どのAIも呼び出さない。
//
// handleKnowledgeApi 側の呼び出し1箇所だけに挿入することで、D1検索・3モール
// のキーワード生成・filterCategoryMismatches・semanticSearchGroups が自動的
// に展開の恩恵を受ける（各モジュールを個別に改修する必要がない）。

export const QUERY_EXPANSION_WEIGHTS = Object.freeze({
  primary: 1,
  synonym: 0.8,
  related: 0.5,
  broad: 0.3
});

// 正規表現は日本語の口語表現・英語表現の両方をカバーする。ルールを追加する
// 際は、既存ルールと意図せず重複マッチしないよう、なるべく具体的なフレーズ
// にすること。「◯◯っぽい」「◯◯系」のようなスタイル修飾だけの語や、既に
// 正式名詞そのもの（「ワイヤレスイヤホン」等）には反応させない。
const EXPANSION_RULES = [
  {
    id: 'bottom-removable-bottle',
    // 2026-09-04 大隆さん実機報告: 「底開口 水筒」で底が外せる水筒（ドウシシャ sokomo
    // 「そこまで洗えるボトル」など）が出ない。商品側の語は「底が取り外せる」「そこまで洗える」
    // 「分解して洗える」で、「底開口」という語は使われないため、モールの AND 検索で0件になる。
    // 「底」「取り外」「水筒」の3語なら sokomo 系の商品名・説明に部分一致し、他社の底が外せる
    // 水筒（分解洗浄タイプ）にも届く。
    match: /(?=.*(?:底開口|底開き|底が開|底が外|底が取り外|底.?取り外|底.?取れる|底まで洗|そこまで洗|分解.{0,4}洗|丸洗い.{0,6}底|底.{0,4}丸洗い))(?=.*(?:水筒|ボトル|マグ|魔法瓶|タンブラー|bottle))/iu,
    primary: 'そこまで洗えるボトル 水筒',
    // モール検索語の組み立て（buildAmazon/RakutenSearchKeywords）で「水筒」まで削られないよう、
    // この語をそのまま第1候補としてモールへ渡す（index.mjs 側で参照）。
    marketplaceKeywords: 'そこまで洗えるボトル 水筒',
    synonyms: ['底が取り外せる 水筒', 'ゴリラの底ヂカラ', '分解して洗える 水筒'],
    related: ['sokomo ドウシシャ 水筒', '洗いやすい 水筒 広口'],
    broad: ['水筒']
  },
  {
    id: 'self-standing-tote-bag',
    match: /(?=.*(?:自立|倒れにく|型崩れしにく))(?=.*(?:トート|バッグ|bag))/iu,
    primary: '自立 トートバッグ 底板 マチあり',
    synonyms: ['自立するトートバッグ', '底板付きトートバッグ', '底鋲付きトートバッグ'],
    related: ['A4 PC収納 トートバッグ', '仕切り付きトートバッグ'],
    broad: ['トートバッグ']
  },
  {
    id: 'lilmoon-rola-colored-contacts',
    // 2026-08-09 ユーザー正解フィードバック:
    // 「カラコン ローラ 度入り」はLILMOON（リルムーン）の度あり商品を指す。
    // 現行公式サイトでもLILMOONの度数展開を確認済み。
    // https://www.lilmoon.jp/ / https://www.lilmoon.jp/product/chocolate.html
    // 人名「ローラ」単独では別商品へ誤展開し得るため、カラコン文脈との共起を必須にする。
    match: /(?=.*(?:カラコン|カラー\s*コンタクト|color(?:ed)?\s*contacts?))(?=.*(?:ローラ|rola))(?=.*(?:度入り|度あり|度数|prescription))/iu,
    primary: 'LILMOON リルムーン 度あり',
    synonyms: ['リルムーン カラーコンタクト', 'LILMOON prescription color contacts'],
    related: ['LILMOON 1DAY', 'LILMOON 1MONTH'],
    broad: ['度あり カラコン']
  },
  {
    id: 'handheld-fan',
    // 合格条件: 「顔用扇風機」「暑い時に顔に風くるやつ」→ ハンディファン
    match: /(顔用扇風機|顔[にへ]?.{0,6}(?:あてる|向ける|くる|来る).{0,6}扇風機|扇風機.{0,6}顔|暑い.{0,10}(?:時|とき).{0,10}顔.{0,10}風.{0,10}(?:くる|来る|当た|涼)|顔.{0,10}風.{0,10}(?:くる|来る|当た|涼).{0,10}(?:やつ|もの|扇風機)?|face\s*fan|hand[- ]?held\s*fan|cool(?:ing)?\s+(?:my|your)\s*face)/iu,
    primary: 'ハンディファン',
    synonyms: ['携帯扇風機', 'ミニ扇風機'],
    related: ['USB扇風機'],
    broad: ['扇風機']
  },
  {
    id: 'power-bank',
    // 例: 「スマホの電気なくなった時のやつ」→ モバイルバッテリー
    match: /(スマホ.{0,10}(?:電気|充電|バッテリー).{0,10}(?:なくな|切れ)|携帯.{0,10}(?:電気|充電|バッテリー).{0,10}(?:なくな|切れ)|バッテリー.{0,10}切れ.{0,10}スマホ|phone\s*(?:battery\s*)?died|out\s*of\s*(?:battery|charge))/iu,
    primary: 'モバイルバッテリー',
    synonyms: ['携帯充電器', 'ポータブル充電器'],
    related: ['USB充電器'],
    broad: ['充電器']
  },
  {
    id: 'garment-steamer',
    // 例: 「服のシワ取るやつ」→ 衣類スチーマー
    match: /(服.{0,8}(?:の)?シワ.{0,8}(?:取る|とる|伸ばす)|しわ.{0,8}(?:取る|とる|伸ばす).{0,8}服|衣類.{0,8}しわ.{0,8}伸ば|garment\s*steamer|wrinkle.{0,10}(?:remover|out)\s*(?:for\s*)?clothes?)/iu,
    primary: '衣類スチーマー',
    synonyms: ['ハンディスチーマー', 'アイロンスチーマー'],
    related: ['スチームアイロン'],
    broad: ['アイロン']
  },
  {
    id: 'compression-pouch',
    // 例: 「旅行で服を小さくするやつ」「旅行で荷物を小さくしたい」→ 圧縮ポーチ
    match: /(旅行.{0,12}(?:荷物|服|スーツケース|かばん|カバン).{0,12}(?:小さく|コンパクト|圧縮)|(?:荷物|服|スーツケース).{0,12}(?:小さく|コンパクト|圧縮).{0,12}旅行|圧縮.{0,4}(?:袋|バッグ|ポーチ)|packing\s*cubes?|compression\s*(?:bag|pouch)es?)/iu,
    primary: '圧縮ポーチ',
    synonyms: ['圧縮袋', 'トラベルポーチ'],
    related: ['パッキングキューブ'],
    broad: ['旅行用ポーチ']
  },
  {
    id: 'streaming-device',
    // 例: 「テレビにYouTube映すやつ」→ ストリーミングデバイス
    match: /(テレビ.{0,10}(?:youtube|ユーチューブ|動画|配信|ネット).{0,10}(?:映す|見る|流す|つなぐ)|streaming\s*(?:device|stick|player)|cast\s*(?:to|on)\s*(?:my\s*)?tv)/iu,
    primary: 'ストリーミングデバイス',
    synonyms: ['Fire TV Stick', 'Chromecast'],
    related: ['メディアプレーヤー'],
    broad: ['テレビ周辺機器']
  },
  {
    id: 'wireless-earphones',
    // 例: 「耳につける線ないやつ」→ ワイヤレスイヤホン
    match: /(耳.{0,6}(?:に)?つける.{0,8}線.{0,6}ない|線.{0,6}ない.{0,8}イヤホン|コード.{0,6}ない.{0,8}イヤホン|wireless\s*ear\s*(?:phone|bud)s?|no\s*wire.{0,10}ear)/iu,
    primary: 'ワイヤレスイヤホン',
    synonyms: ['完全ワイヤレスイヤホン', 'Bluetoothイヤホン'],
    related: ['イヤホン'],
    broad: ['オーディオ機器']
  }
];

function normalize(value) {
  return String(value || '').normalize('NFKC');
}

export function findExpansionRule(query) {
  const text = normalize(query);
  return EXPANSION_RULES.find((rule) => rule.match.test(text)) || null;
}

// primary をクエリ本文へ合流させ、synonym/related/broad はメタデータとして
// 返す。クエリの長さは呼び出し元(validateKnowledgeRequest)で既に2〜200文字に
// 検証済みだが、合流後も安全のため200文字で切り詰める。
export function expandSearchQuery(query) {
  const original = normalize(query).trim();
  const rule = findExpansionRule(original);
  if (!rule) {
    return { query: original, expanded: false, expansion: null };
  }
  const alreadyHasPrimary = original.includes(rule.primary);
  const combined = alreadyHasPrimary ? original : `${rule.primary} ${original}`.trim();
  return {
    query: combined.slice(0, 200),
    expanded: true,
    expansion: {
      rule_id: rule.id,
      primary: rule.primary,
      synonyms: rule.synonyms || [],
      related: rule.related || [],
      broad: rule.broad || [],
      weights: QUERY_EXPANSION_WEIGHTS
    }
  };
}

export const queryExpansionRuleIds = Object.freeze(EXPANSION_RULES.map((rule) => rule.id));
