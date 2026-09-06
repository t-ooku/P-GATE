// 2026-09-06 大隆さん指摘: 「ショップの中の詳細条件がメルカリやAmazonのような検索方法に
// なってない」。
//
// 本当のことを先に書く: いま products テーブルにあるのは
// 商品名・メーカー・画像・在庫・取込日時だけで、**価格もカテゴリも評価も入っていない**
// （marketplace_offers と sp_api_listings は本番で0件）。だから Amazon の左側にある
// 「価格帯」「星4つ以上」のような絞り込みは、いま作っても何も絞れない。
//
// 代わりに、いまのデータで本当に効く絞り込みを作る:
//   (1) メーカー・ブランドの複数選択（既存は1つだけだった）
//   (2) 商品名から作る「絞り込みワード」（メルカリの絞り込みに近い）
//       いま表示されている商品の名前を数えて、よく出てくる語をチップにする。
//       押すと検索語に足される。データにある語しか出ないので空振りしない。
//
// 価格・カテゴリ・評価で絞れるようにするには、まず価格とカテゴリを取り込む必要がある。

// 商品名でよく使われるが、絞り込みには役立たない語。
const STOP_WORDS = new Set([
  'セット', 'まとめ', '正規品', '日本製', '送料無料', '新品', '純正', '対応', '専用', '兼用', '汎用',
  'ギフト', 'プレゼント', 'ラッピング', 'メール便', '宅配便', 'あす楽', '限定', '特価', '在庫',
  'サイズ', 'カラー', 'タイプ', 'モデル', 'シリーズ', 'ブランド', 'メーカー', '商品', '本体',
  'その他', '各種', '選べる', 'おしゃれ', 'かわいい', 'シンプル', '人気', 'おすすめ'
]);

// 日本語の商品名を、形態素解析なしで「絞り込みに使える語」に割る。
// カタカナの連続・漢字の連続・英数字の型番・数量表記（500ml など）を拾う。
const TOKEN_PATTERN = /[ァ-ヴー]{2,12}|[一-龥]{2,6}|[0-9]{1,4}(?:\.[0-9]{1,2})?(?:ml|L|g|kg|cm|mm|m|インチ|枚|個|本|人用|畳|W|V|A)|[A-Za-z][A-Za-z0-9-]{2,15}/gu;

export function shopKeywordTokens(title) {
  const matches = String(title || '').match(TOKEN_PATTERN) || [];
  const tokens = [];
  for (const raw of matches) {
    const token = raw.trim();
    if (!token || token.length < 2 || token.length > 16) continue;
    if (STOP_WORDS.has(token)) continue;
    // 「株式会社」「有限会社」など会社表記は絞り込みにならない。
    if (/^(?:株式|有限|合同)?会社$/u.test(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

// 商品名の一覧から「絞り込みワード」を作る。
// - 既に検索語・ブランドに使われている語は出さない（押しても結果が変わらないため）
// - 全件に出てくる語は絞り込みにならないので落とす（例: 1店舗しか無い商品名の共通語）
// - 1件しか無い語も出さない（押した瞬間に1件になるチップは邪魔）
export function shopKeywordFacets(titles = [], { exclude = [], limit = 12, total = 0 } = {}) {
  const excluded = new Set(exclude.map((value) => String(value || '').trim()).filter(Boolean));
  const counts = new Map();
  const sampled = titles.length;
  for (const title of titles) {
    // 同じ商品名の中で同じ語を二重に数えない。
    for (const token of new Set(shopKeywordTokens(title))) {
      if (excluded.has(token)) continue;
      if ([...excluded].some((value) => value.includes(token) || token.includes(value))) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  const upperBound = Math.max(2, Math.floor(sampled * 0.9));
  return [...counts.entries()]
    .filter(([, count]) => count >= 2 && count <= upperBound)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ja'))
    .slice(0, limit)
    .map(([word, count]) => ({
      word,
      // 見えている件数から推定した目安。総数が分かるときだけ比率で伸ばす。
      count: total > sampled && sampled > 0 ? Math.max(count, Math.round((count / sampled) * total)) : count,
      estimated: total > sampled && sampled > 0
    }));
}

// 検索語に絞り込みワードを足す・外す（同じ語を二重に足さない）。
export function toggleKeywordInQuery(query, word) {
  const parts = String(query || '').split(/[\s　]+/u).map((value) => value.trim()).filter(Boolean);
  const target = String(word || '').trim();
  if (!target) return parts.join(' ');
  const index = parts.findIndex((value) => value === target);
  if (index >= 0) parts.splice(index, 1);
  else parts.push(target);
  return parts.join(' ').slice(0, 80);
}

export function queryWords(query) {
  return String(query || '').split(/[\s　]+/u).map((value) => value.trim()).filter(Boolean).slice(0, 8);
}
