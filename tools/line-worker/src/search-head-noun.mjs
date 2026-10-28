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
  // 2026-09-18 大隆さん指示 P0-3: ひらがなの商品名詞(「こたつ」)。末尾がひらがなだと主名詞が取れず
  // 判定不能(null→2扱い)になり、「こたつ毛布」が本体として PASS していた。
  'こたつ', 'コタツ',
  '水筒', 'タンブラー', 'マグカップ', 'ボトル', '弁当箱', 'フライパン', '鍋', '包丁', 'まな板', '食器', '皿', '傘', '収納', 'ピロー',
  // 台所用品(「ワンピース お玉」のように衣類語が形状の修飾語になる商品を見分ける)
  'お玉', 'おたま', 'ヘラ', 'トング', 'ザル', 'ボウル', 'スプーン', 'フォーク', '箸', '菜箸', '泡立て器', 'ピーラー', 'おろし器',
  '計量カップ', '保存容器', 'タッパー', '水切り', '鍋敷き', '鍋つかみ', 'エプロン', 'ふきん', 'スポンジ', 'キッチンペーパー', 'ゴミ箱', '洗剤',
  // 家電・ガジェット
  'イヤホン', 'ヘッドホン', 'スピーカー', 'カメラ', 'プリンター', 'モニター', 'キーボード', 'マウス', '充電器', 'ケーブル', 'バッテリー', 'スマホケース',
  'ドライヤー', 'アイロン', 'ヘアアイロン', '掃除機', '炊飯器', 'トースター', 'ケトル', 'ブレンダー', 'ミキサー', 'テレビ', 'タブレット', 'スマートウォッチ',
  // 食品・その他
  'キムチ', 'コーヒー', '紅茶', 'お茶', 'チョコレート', 'クッキー', 'グミ', 'サプリ', 'プロテイン', 'おもちゃ', 'ぬいぐるみ', 'フィギュア', '文房具', 'ノート', 'ペン',
  'マスク', 'ステッカー', 'シール', 'クリップ', 'カバー', 'ホルダー', 'スタンド', 'リモコン', 'Tシャツ',
  // 2026-10-07 カナリア dark_ink_name_pen FAIL対応: 「名前ペン」のように漢字+カタカナが
  // 混在する複合語は、末尾の同一スクリプト区間(run)だけを見ると末尾のカタカナ「ペン」しか
  // 取れず、汎用語「ペン」に一致する無関係な商品(名入れボールペン等)を主名詞一致(強)として
  // 拾ってしまう。「名前ペン」を辞書に登録し、下のextractHeadNounsでlast(末尾トークン全体)
  // とも照合することで、より長く具体的な複合語を優先させる。
  '名前ペン', '布用ペン',
  // 2026-10-16 固定QA ig_mattress: 本体(マットレス)を探す検索に「Mattress Topper」が本命で入った。
  // トッパーは本体の上に重ねる別商品。商品名詞として登録し、「マットレス トッパー」「Mattress Topper」
  // の「マットレス」を本体の出現とみなさない(直後に別の商品名詞が来る規則)。トッパー自体の検索は残す。
  'トッパー', 'topper'
]);
const HEAD_ALIASES = Object.freeze({
  '指輪': ['リング'], 'リング': ['指輪'], '靴': ['スニーカー', 'シューズ', 'サンダル', 'ブーツ', 'パンプス'], 'ワンピース': ['ワンピ'],
  '椅子': ['チェア'], 'チェア': ['椅子'], '鏡': ['ミラー'], 'ミラー': ['鏡'], '収納': ['収納ケース', '収納ボックス', '収納ラック'],
  'ファンデ': ['ファンデーション'], '時計': ['ウォッチ', '腕時計'], 'ライト': ['ランプ', '照明'], 'マグカップ': ['マグ'],
  'キムチ': ['kimchi'], 'リップ': ['ティント', 'リップスティック', 'リップグロス', 'リップバーム', 'lipstick', 'lip tint', 'lip gloss'], '枕': ['ピロー'], 'ピロー': ['枕'],
  'こたつ': ['コタツ'], 'コタツ': ['こたつ'],
  // 2026-09-26 カナリア ig_mattress FAIL対応: 2026-09-25 に qoo10_korean_lip で
  // 見つかった「英語表記の商品名には HEAD_ALIASES の英語エイリアスが無いと
  // 一致しない」不具合と同型(normalize() の小文字化修正は既にあるが、
  // 'マットレス' には英語エイリアス自体が未登録だった)。海外セラーの
  // 英語表記商品名(「Napier Sportz Air Mattress」)に対応する。
  'マットレス': ['mattress'],
  // 2026-09-27 カナリア bottom_removable_bottle FAIL対応: 「水筒 ステンレスボトル」
  // のように、水筒・ボトル・タンブラー・魔法瓶は商品名の中で言い換え表記として
  // 並記されることが多い(同じ密閉ドリンクウェアの別名で、衣類「ワンピース お玉」
  // のような「主名詞+別カテゴリ商品」の一体型商品ではない)。相互にエイリアス
  // 登録しないと、直後の語が辞書上の別名詞というだけで正しい候補が付属品扱い
  // で除外されていた(occurrenceIsClean の「主名詞の直後に別の商品名詞」判定)。
  // マグカップ/マグは開口部が異なる別カテゴリのため対象外。
  '水筒': ['ボトル', 'タンブラー', '魔法瓶'], 'ボトル': ['水筒', 'タンブラー', '魔法瓶'],
  'タンブラー': ['水筒', 'ボトル', '魔法瓶'], '魔法瓶': ['水筒', 'ボトル', 'タンブラー'],
  'トッパー': ['topper'], 'topper': ['トッパー']
});
// 主名詞に直接くっついた別の商品名詞(「こたつ毛布」「こたつ布団」「こたつカバー」)は、主名詞が
// 用途を表す修飾語になっている付属品・関連商品。ただし「本体そのもの」を表す語(こたつテーブル・
// こたつ本体)や、主名詞と同種の語は除く。辞書外の一般語も含めて固定で持つ。
const ATTACHED_ACCESSORY_SUFFIXES = Object.freeze([
  '毛布', '布団', 'ふとん', '掛け布団', '敷き布団', '中掛け', '上掛け', '敷きパッド', '敷パッド', 'カバー', 'ケース', 'ホルダー', 'スタンド',
  'コード', 'ヒーターユニット', '継ぎ脚', '継脚', '脚', 'リモコン', 'フィルター', 'ストラップ', '袋', 'トッパー'
]);
const ATTACHED_BODY_SUFFIXES = Object.freeze(['テーブル', 'デスク', '本体', 'セット']);
const BODY_COMPOUND_HEADS = new Set(['こたつ', 'コタツ']);
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
  // 2026-09-25 カナリア qoo10_korean_lip FAIL対応: Qoo10等の英語表記商品名
  // (「Statement Lipstick」)は、HEAD_ALIASES に英語表記(例: 'kimchi')を
  // 登録していても大文字小文字が揃わず一致しなかった(indexOfは大小文字を
  // 区別する)。ASCII部分だけ小文字化しても日本語(カタカナ・漢字・ひらがな)
  // の判定には影響しない。
  return String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

// 検索文の末尾から主名詞を取り出す。末尾のカタカナ列/漢字列を見て、辞書の
// 名詞で終わっていればそれを弱い主名詞、列全体を強い主名詞とする。
export function extractHeadNouns(query) {
  let text = normalize(query).replace(TRAILING_PHRASES, '').trim();
  if (!text) return [];
  const last = text.split(/[\s、,／/]+/u).filter(Boolean).pop() || '';
  const run = last.match(/([\p{Script=Katakana}ー]{2,}|[\p{Script=Han}]{1,6}|[A-Za-z][A-Za-z0-9-]{2,}|[\p{Script=Hiragana}]{2,})$/u)?.[1] || '';
  if (!run) return [];
  const heads = [];
  // ひらがな列は助詞・活用を含む(「にならないこたつ」)ので、辞書の商品名詞で終わる時だけ、
  // その名詞そのものを強い主名詞にする(列全体は使わない)。
  if (/^[\p{Script=Hiragana}]+$/u.test(run)) {
    const hiraganaHead = PRODUCT_HEADS.filter((noun) => run.endsWith(noun)).sort((a, b) => b.length - a.length)[0] || '';
    return hiraganaHead ? [{ term: hiraganaHead, strength: 2 }] : [];
  }
  // 2026-10-07: 辞書照合は run(末尾の同一スクリプト区間)ではなく last(末尾トークン全体、
  // スクリプトの境界をまたぐ)に対して行う。run は「お名前ペン」では末尾カタカナの「ペン」
  // しか取れないが、last なら辞書に登録した「名前ペン」のような複合語にも一致できる。
  // run・dictionaryHead のどちらが長いかで強い主名詞/弱い主名詞を決める(以前は run が常に
  // dictionaryHead 以上の長さだったため常に run=強だったが、複合語辞書登録により
  // dictionaryHead の方が長くなるケースが出てきたため、長さで決める)。
  const dictionary = PRODUCT_HEADS.filter((noun) => last.endsWith(noun)).sort((a, b) => b.length - a.length);
  const dictionaryHead = dictionary[0] || '';
  if (dictionaryHead && dictionaryHead !== run) {
    const strongTerm = dictionaryHead.length > run.length ? dictionaryHead : run;
    const weakTerm = dictionaryHead.length > run.length ? run : dictionaryHead;
    heads.push({ term: strongTerm, strength: 2 });
    heads.push({ term: weakTerm, strength: 1 });
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
  // 主名詞に直接くっついた付属品語(「こたつ毛布」「こたつカバー」)。「こたつテーブル」の
  // ように本体を表す語が続く場合は商品そのもの。
  if (after && !/^\s/u.test(after)) {
    const attached = after.split(TOKEN_SPLIT)[0] || '';
    const bodySuffix = ATTACHED_BODY_SUFFIXES.find((suffix) => attached.startsWith(suffix));
    const accessorySuffix = ATTACHED_ACCESSORY_SUFFIXES.find((suffix) => attached.startsWith(suffix));
    // 「マットレストッパー付き」「こたつ布団付き」のように付属品語に「付き」が続けば本体を含む商品
    const withAccessory = accessorySuffix && /^\s*付/u.test(attached.slice(accessorySuffix.length));
    if (!bodySuffix && accessorySuffix && !withAccessory && !relatedToHeads(accessorySuffix, headTerms)) return false;
  }
  // 主名詞の直後に別の商品名詞が来る(「ワンピース お玉」= 一体型のお玉)なら、
  // 主名詞は形状・種類の修飾語であって商品そのものではない。
  if (/^\s/u.test(after)) {
    const nextToken = after.trim().split(TOKEN_SPLIT)[0] || '';
    const nextNoun = productNounOfToken(nextToken);
    // 2026-10-28: 「こたつ テーブル」のように本体を表す語が空白を挟んで続く場合も商品そのもの
    // (直接くっついた「こたつテーブル」と同じ扱い)。こたつ系の主名詞に限る。
    const bodyNext = BODY_COMPOUND_HEADS.has(head) && ATTACHED_BODY_SUFFIXES.some((suffix) => nextToken.startsWith(suffix));
    if (nextNoun && !bodyNext && !relatedToHeads(nextNoun, headTerms) && !ACCESSORY_WORDS.test(nextNoun)) return false;
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
  if (isExplicitAccessoryMismatch(normalizedQuery, normalizedTitle)) return { score: 0, position: 1 };
  if (isBedFrameForMattressQuery(heads, normalizedQuery, normalizedTitle)) return { score: 0, position: 1 };
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
  // 2026-10-16 固定QA dark_ink_name_pen: 強い主名詞が辞書の複合語(「名前ペン」「布用ペン」)で、弱い主名詞
  // (「ペン」)が商品名では別の複合語(「ボールペン」「サインペン」)の一部としてしか出ないなら、種類の違う
  // 商品(名入れボールペン)。辞書外の長い語(「トートバッグ」→「エコバッグ」)や「ボールペン」自体の検索は対象外。
  if (strong && strong.term !== weak.term && strong.term.endsWith(weak.term) && PRODUCT_HEADS.includes(strong.term)
    && KATAKANA.test(weak.term)) {
    const before = normalizedTitle.slice(0, weakResult.index);
    const prefix = before.match(/[\p{Script=Katakana}ー]+$/u)?.[0] || '';
    if (prefix) return { score: 0, position: 1 };
  }
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
  // Explicit accessory mismatches must not reappear through the zero-match
  // fallback, including when the provider returns just one accessory.
  const list = (Array.isArray(candidates) ? candidates : [])
    .filter(candidate => !isExplicitAccessoryMismatch(normalize(query), normalize(titleOf(candidate))));
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

// 2026-10-17 固定QA dark_ink_name_pen(候補取得): モール検索のキーワード候補を順に試す時、
// 1つ目の語(「濃く書ける お名前ペン」)の結果が全件カテゴリ違い(名入れボールペン)でも
// 「0件でない」だけで採用され、次の語(「お名前ペン」)へ進まなかった。最後の applyHeadNounGate は
// 全件不一致なら元順序を残す(空にしない)ため、そのまま本命になっていた。
// 候補の中に主名詞が商品そのもの/弱い一致(score>0)の商品が1件でもあるかを返す。主名詞が
// 取れない検索文は判定しない(true)。
export function hasHeadNounMatch(query, candidates = [], { titleOf = defaultTitle } = {}) {
  const heads = extractHeadNouns(query);
  if (!heads.length) return true;
  return (Array.isArray(candidates) ? candidates : [])
    .some((candidate) => (headNounDetail(query, titleOf(candidate), heads).score || 0) > 0);
}

function isExplicitAccessoryMismatch(query, title) {
  if (/上履き|上履|上靴/u.test(query) && !/バッグ|ケース|靴袋|中敷|ネット/u.test(query)) {
    return /シューズ(?:バッグ|ケース)|靴袋|洗濯ネット|中敷きのみ/u.test(title);
  }
  if (/(?:猫.*トイレ|キャットトイレ)/u.test(query) && !/マット|シート|スコップ/u.test(query)) {
    return /(?:砂取りマット|猫砂マット|トイレマット|滑り止めマット|猫砂キャッチャー|スコップのみ|シートのみ)/u.test(title);
  }
  if (/マットレス/u.test(query) && !/カバー|プロテクター|シーツ/u.test(query)) {
    return /マットレス\s*(?:保護)?\s*(?:カバー|プロテクター|シーツ)/u.test(title);
  }
  // 2026-10-24 固定QA dark_ink_name_pen(受信箱 2026-10-24-name-pen-semantic-mismatch):
  // 10/22・10/23 はモールが名前ペンを1件も返さず(C7、検索コードの変更なし)、全件不一致の
  // 元順序フォールバックで「名入れ … 油性ボールペン」が本命に戻った。布・持ち物に名前を書く
  // お名前ペン/布用ペンを探す検索では、名前ペン・布用と書いていないボールペン(名入れ販促品・
  // 通常の油性ボールペン)を本体候補にしない。ボールペンや名入れを探す検索は従来どおり。
  if (NAME_PEN_QUERY.test(query) && !/ボールペン|名入れ/u.test(query)) {
    return /ボールペン/u.test(title) && !NAME_PEN_TITLE.test(title);
  }
  // 2026-10-28 固定QA oil_free_air_fryer / energy_saving_kotatsu(受信箱 2026-10-28-appliance-accessory-exclusion):
  // 家電本体(ノンフライヤー/こたつ)を探す検索で、本命が「ノンフライヤーライナー/シリコンシート」
  // 「こたつ省エネダクト・温風ヒーター用パイプ」だった。主名詞の直後が辞書外の付属品語(ライナー・ダクト)
  // のため本体扱い(2)になっていた。付属品だけの商品は候補から外し、全件付属品の時も元順序の
  // フォールバックで本命に戻さない。付属品を明示した検索・「〜付き/付属/同梱」の本体は従来どおり。
  const appliance = APPLIANCE_ACCESSORY_RULES.find((rule) => rule.query.test(query));
  if (appliance && !appliance.queryAccessory.test(query)) {
    return appliance.titleAccessory.test(title) && !appliance.bundled.test(title);
  }
  return false;
}

const APPLIANCE_ACCESSORY_RULES = Object.freeze([
  {
    query: /ノンフライヤー|エアフライヤー|air\s*fryer/u,
    queryAccessory: /ライナー|シート|ペーパー|マット|トレー|バスケット|カップ|ポット|天板|ラック|網|交換|替え|部品|パーツ|専用|用品|アクセサリ|liner|paper|accessor/u,
    titleAccessory: /ライナー|シリコン\s*(?:シート|マット|トレー|カップ|ポット|バスケット|容器)|クッキング\s*(?:シート|ペーパー)|(?:専用|用)\s*(?:ペーパー|シート|トレー|ラック|バスケット)|liner|parchment/u,
    bundled: /(?:ライナー|シート|ペーパー|トレー|ラック|バスケット|liner)\s*(?:\d+\s*枚)?\s*(?:付|付属|同梱|入り?\s*セット)|(?:ライナー|シート|ペーパー)\s*(?:不要|いらず|なし)|\bwith\s+(?:\w+\s+){0,2}liners?\b/u
  },
  {
    query: /こたつ|コタツ|炬燵|kotatsu/u,
    queryAccessory: /ダクト|パイプ|ホース|ヒーター(?:ユニット)?(?:のみ|単体|交換)|ユニット|コード|部品|パーツ|交換|替え|専用|用品|布団|ふとん|毛布|カバー|敷|掛け|継ぎ脚|継脚|脚|天板|duct/u,
    titleAccessory: /ダクト|(?:温風|ヒーター)\s*(?:用)?\s*パイプ|(?:取替|交換)\s*用|(?:取替|交換)\s*(?:ヒーター|ユニット)|ヒーターユニット\s*(?:のみ|単体)|duct/u,
    bundled: /(?:ダクト|パイプ)\s*(?:付|付属|同梱)/u
  }
]);

const NAME_PEN_QUERY = /お?名前ペン|おなまえ(?:ペン|マーカー)|なまえペン|ネームペン|布用ペン/u;
const NAME_PEN_TITLE = /お?名前ペン|おなまえ|なまえペン|ネームペン|布用|布書き|名前書き/u;

// 2026-10-20 固定QA ig_mattress: 本命が「Best Price Mattress Twin Bed Frame 12 Soild Wood Platform Bed Frame」。
// ブランド名の Mattress が主名詞に一致して本体扱い(2)になったが、商品は英語の Bed Frame / Platform Bed Frame。
// マットレス本体を探す検索で、英語の bed frame が商品名にあり、マットレスが「付属・セット」でも
// 「〜用/対応のフレーム」の説明でもない時は本体候補にしない。frame という語全体は禁止しない
// (box spring / picture frame 等は対象外)。フレームを探す検索・日本語の商品名は従来どおり。
const EN_BED_FRAME = /\b(?:platform\s+)?bed\s*-?\s*frames?\b/u;
const EN_MATTRESS_SET = /(?:\b(?:with|w\/|incl(?:udes?|uding)?|plus|and)\s+(?:[a-z0-9"'-]+\s+){0,3}mattress\b|[+&]\s*(?:[a-z0-9"'-]+\s+){0,3}mattress\b|\bmattress\s+(?:included|set|bundle|combo)\b|\bmattress\s*(?:and|&|\+)\s*(?:[a-z0-9"'-]+\s+){0,2}(?:platform\s+)?bed\s*-?\s*frames?\s+(?:set|bundle|combo)\b|マットレス\s*(?:付|セット))/u;
const EN_FRAME_COMPATIBLE = /\b(?:for|fits?|fit\s+for|fits?\s+(?:most|any|all|standard)|compatible\s+with|works?\s+with|on|no)\s+(?:[a-z0-9"'-]+\s+){0,3}(?:platform\s+)?bed\s*-?\s*frames?\b|\bbed\s*-?\s*frames?\s+(?:not\s+included|sold\s+separately)\b/u;
function isBedFrameForMattressQuery(heads, query, title) {
  if (!heads.some(({ term }) => term === 'マットレス' || term.endsWith('マットレス') || term === 'mattress')) return false;
  if (/フレーム|frame|ベッド\s*(?:本体)?$/u.test(query)) return false;
  if (!EN_BED_FRAME.test(title)) return false;
  if (EN_MATTRESS_SET.test(title) || EN_FRAME_COMPATIBLE.test(title)) return false;
  return true;
}

function defaultTitle(candidate) {
  return String(candidate?.product_name || candidate?.display_name || candidate?.name || candidate?.title || '');
}

export const searchHeadNounTest = Object.freeze({ PRODUCT_HEADS, occurrenceIsClean });
