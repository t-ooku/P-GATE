// 検索文の「どこで見たか」を検索語から切り離す(2026-09-03, 指示書 §5/§7)。
//
// 「Instagramで見たマットレス」「Amazonで見た収納用品」のような入力は、
// 「Instagram」「Amazon」が商品語としてモールAPIへ渡ると無関係な商品
// (Amazon Fire TV のリモコン等)を引く。ここで出所(origin)だけを取り出して
// 商品語から外し、出所はモール導線の表示順(§7: Instagram由来の韓国コスメなら
// Qoo10 を先に)にだけ使う。利用者の入力は保存しない。

const PLATFORMS = Object.freeze([
  { origin: 'INSTAGRAM', pattern: /(?:instagram|インスタグラム|インスタ|ig|リール|reels?)/iu },
  { origin: 'TIKTOK', pattern: /(?:tiktok|ティックトック|ティックトック)/iu },
  { origin: 'X', pattern: /(?:twitter|ツイッター|ツイート|(?<![a-z])x(?![a-z]))/iu },
  { origin: 'YOUTUBE', pattern: /(?:youtube|ユーチューブ|ショート動画|shorts)/iu },
  { origin: 'QOO10', pattern: /(?:qoo10|キューテン|メガ割)/iu },
  { origin: 'SHEIN', pattern: /(?:shein|シーイン)/iu },
  { origin: 'AMAZON', pattern: /(?:amazon|アマゾン)/iu },
  { origin: 'RAKUTEN', pattern: /(?:楽天|rakuten)/iu },
  { origin: 'YAHOO', pattern: /(?:yahoo|ヤフー)/iu },
  { origin: 'ZOZOTOWN', pattern: /(?:zozo(?:town)?|ゾゾ)/iu },
  { origin: 'SNS', pattern: /(?:sns|動画|ライブ配信|配信|バズって|バズった|流れてき)/iu }
]);

// 「<出所>(で|に|の)(見た|見かけた|…)(やつ|もの|の|商品)?」を1まとまりとして
// 検索語から外す。出所語だけ(例: 「Qoo10 韓国リップ」)は出所として認識
// するが、商品語としては残さない。
const SEEN_PHRASE = /(?:で|に|にて|の)\s*(?:見た|見かけた|みた|出て(?:い)?た|出てきた|流れてきた|流れて来た|バズって(?:い)?た|バズった|紹介され(?:て)?(?:い)?た|おすすめされ(?:て)?(?:い)?た|話題の|話題になっ(?:て)?(?:い)?た|人気の|載って(?:い)?た|見つけた|発見した)\s*(?:やつ|もの|の|商品|アイテム|これ|あれ)?\s*(?:、|,)?/u;
const PLATFORM_WORD = /(?:instagram|インスタグラム|インスタ|tiktok|ティックトック|twitter|ツイッター|(?<![a-z0-9])x(?![a-z0-9])|youtube|ユーチューブ|qoo10|キューテン|shein|シーイン|amazon|アマゾン|楽天市場|楽天|rakuten|yahoo!?\s*(?:ショッピング)?|ヤフー|zozotown|zozo|ゾゾタウン|ゾゾ|sns|ショート動画|動画|リール|reels?)/iu;
const KOREAN = /(?:韓国|韓流|k-?beauty|kビューティ|オルチャン|韓国っぽ|韓国風|韓国系|한국)/iu;

function detectOrigin(text) {
  for (const { origin, pattern } of PLATFORMS) {
    if (pattern.test(text)) return origin;
  }
  return '';
}

export function extractSearchOrigin(query) {
  const original = String(query || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!original) return { query: '', origin: '', korean: false, stripped: false };
  let text = original;
  let origin = '';
  // 1) 「<出所>で見た…」のまとまり
  const seen = new RegExp(`(${PLATFORM_WORD.source})\\s*${SEEN_PHRASE.source}`, 'iu');
  const seenMatch = text.match(seen);
  if (seenMatch) {
    origin = detectOrigin(seenMatch[1]);
    text = text.replace(seen, ' ');
  } else {
    // 2) 出所語が無くても「どこかで見た」「見かけた」だけの文脈語は外す
    text = text.replace(new RegExp(`(?:どこか|どっか|街|お店|店|カフェ|友達の家)?\\s*${SEEN_PHRASE.source}`, 'u'), ' ');
  }
  // 3) 単独の出所語(「Qoo10 韓国リップ」「インスタ 白いバッグ」)は商品語から外す
  const leading = text.match(new RegExp(`^(${PLATFORM_WORD.source})(?:\\s+|の|で|に|、)`, 'iu'));
  if (leading) {
    origin = origin || detectOrigin(leading[1]);
    text = text.slice(leading[0].length);
  }
  const trailing = text.match(new RegExp(`(?:\\s+|で|の|、)(${PLATFORM_WORD.source})\\s*(?:で|の)?$`, 'iu'));
  if (trailing && !/^(?:x)$/iu.test(trailing[1])) {
    origin = origin || detectOrigin(trailing[1]);
    text = text.slice(0, text.length - trailing[0].length);
  }
  const cleaned = text.replace(/^[\s、,・]+|[\s、,・]+$/gu, '').replace(/\s+/gu, ' ').trim();
  const stripped = cleaned !== original;
  return {
    // 出所を外した結果が空なら元の文を返す(「Instagramで見たやつ」等は
    // 後段の曖昧検索・確認質問に任せる)。
    query: cleaned.length >= 2 ? cleaned : original,
    origin,
    korean: KOREAN.test(original),
    stripped: stripped && cleaned.length >= 2
  };
}

// §7: 表示順は固定しない。出所と韓国系の手がかりから、正解が売られている
// 可能性が高いモールを先頭にする。返り値は marketplace ID の優先順。
export function preferredMarketplaceOrder({ origin = '', korean = false } = {}) {
  if (origin === 'QOO10' || (korean && !['SHEIN', 'AMAZON', 'RAKUTEN', 'YAHOO', 'ZOZOTOWN'].includes(origin))) {
    return ['QOO10_JP', 'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'SHEIN_JP'];
  }
  if (origin === 'SHEIN') return ['SHEIN_JP', 'QOO10_JP', 'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP'];
  if (origin === 'RAKUTEN') return ['RAKUTEN_JP', 'AMAZON_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP'];
  if (origin === 'YAHOO') return ['YAHOO_JP', 'AMAZON_JP', 'RAKUTEN_JP', 'QOO10_JP', 'SHEIN_JP'];
  if (origin === 'ZOZOTOWN') return ['ZOZOTOWN_JP', 'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'SHEIN_JP', 'QOO10_JP'];
  if (['INSTAGRAM', 'TIKTOK', 'X', 'YOUTUBE', 'SNS'].includes(origin)) {
    return ['AMAZON_JP', 'QOO10_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'SHEIN_JP'];
  }
  return ['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP'];
}

export function orderMarketplaceDestinations(destinations, hint = {}) {
  const list = Array.isArray(destinations) ? destinations.slice() : [];
  const order = preferredMarketplaceOrder(hint);
  const rank = (item) => {
    const index = order.indexOf(String(item?.marketplace || ''));
    return index === -1 ? order.length + 1 : index;
  };
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}
