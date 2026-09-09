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

// Amazon・メルカリで一般的な属性のうち、現在の products にある商品名だけで
// 誤認を抑えて判定できるもの。専用列がないため、商品名に明記された属性だけを出す。
export const SHOP_COLOR_FILTERS = Object.freeze([
  { value: 'black', label: 'ブラック・黒', query: '黒', aliases: ['ブラック', '黒', 'black'] },
  { value: 'white', label: 'ホワイト・白', query: '白', aliases: ['ホワイト', '白', 'white'] },
  { value: 'gray', label: 'グレー', query: 'グレー', aliases: ['グレー', '灰色', 'gray', 'grey'] },
  { value: 'beige', label: 'ベージュ', query: 'ベージュ', aliases: ['ベージュ', 'beige'] },
  { value: 'brown', label: 'ブラウン・茶', query: 'ブラウン', aliases: ['ブラウン', '茶色', 'brown'] },
  { value: 'red', label: 'レッド・赤', query: '赤', aliases: ['レッド', '赤', 'red'] },
  { value: 'pink', label: 'ピンク', query: 'ピンク', aliases: ['ピンク', 'pink'] },
  { value: 'orange', label: 'オレンジ', query: 'オレンジ', aliases: ['オレンジ', 'orange'] },
  { value: 'yellow', label: 'イエロー・黄', query: '黄色', aliases: ['イエロー', '黄色', 'yellow'] },
  { value: 'green', label: 'グリーン・緑', query: '緑', aliases: ['グリーン', '緑', 'green'] },
  { value: 'blue', label: 'ブルー・青', query: '青', aliases: ['ブルー', '青', 'blue'] },
  { value: 'purple', label: 'パープル・紫', query: '紫', aliases: ['パープル', '紫', 'purple'] },
  { value: 'silver', label: 'シルバー・銀', query: 'シルバー', aliases: ['シルバー', '銀', 'silver'] },
  { value: 'gold', label: 'ゴールド・金', query: 'ゴールド', aliases: ['ゴールド', '金色', 'gold'] },
  { value: 'clear', label: 'クリア・透明', query: '透明', aliases: ['クリア', '透明', 'clear'] }
]);

export const SHOP_MATERIAL_FILTERS = Object.freeze([
  { value: 'leather', label: '本革', query: '本革', aliases: ['本革', '天然皮革', 'genuine leather', 'real leather'] },
  { value: 'synthetic-leather', label: '合皮', query: '合皮', aliases: ['合皮', '合成皮革', 'PUレザー'] },
  { value: 'cotton', label: '綿・コットン', query: 'コットン', aliases: ['コットン', '綿100', '綿素材', 'cotton'] },
  { value: 'nylon', label: 'ナイロン', query: 'ナイロン', aliases: ['ナイロン', 'nylon'] },
  { value: 'polyester', label: 'ポリエステル', query: 'ポリエステル', aliases: ['ポリエステル', 'polyester'] },
  { value: 'stainless', label: 'ステンレス', query: 'ステンレス', aliases: ['ステンレス', 'stainless'] },
  { value: 'steel', label: 'スチール・金属', query: 'スチール', aliases: ['スチール', '金属製', 'steel'] },
  { value: 'wood', label: '木製', query: '木製', aliases: ['木製', '天然木', 'wood'] },
  { value: 'glass', label: 'ガラス', query: 'ガラス', aliases: ['ガラス', 'glass'] },
  { value: 'silicone', label: 'シリコン', query: 'シリコン', aliases: ['シリコン', 'silicone'] }
]);

const SIZE_PATTERN = /(?:XXS|XS|S|M|L|XL|XXL|3XL)サイズ|サイズ\s*(?:XXS|XS|S|M|L|XL|XXL|3XL)|フリーサイズ|[AB][3-6]|\d{1,4}(?:\.\d{1,2})?\s*(?:mm|cm|ml|L|g|kg|インチ|型|号|合)/giu;

function containsAlias(title, aliases) {
  const source = String(title || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
  return aliases.some((alias) => source.includes(String(alias).normalize('NFKC').toLowerCase().replace(/\s+/gu, '')));
}

export function shopAttributeDefinition(kind, value) {
  const normalized = String(value || '').normalize('NFKC').trim();
  if (kind === 'color') return SHOP_COLOR_FILTERS.find((item) => item.value === normalized) || null;
  if (kind === 'material') return SHOP_MATERIAL_FILTERS.find((item) => item.value === normalized) || null;
  if (kind === 'size' && normalized.length <= 24 && new RegExp(`^(?:${SIZE_PATTERN.source})$`, 'iu').test(normalized)) {
    return { value: normalized, label: normalized, query: normalized, aliases: [normalized] };
  }
  return null;
}

export function shopTitleMatchesAttributes(title, filters = {}) {
  return ['color', 'size', 'material'].every((kind) => {
    const selected = shopAttributeDefinition(kind, filters[kind]);
    return !selected || containsAlias(title, selected.aliases);
  });
}

export function shopAttributeFacets(titles = [], { limit = 16 } = {}) {
  const source = titles.map((title) => String(title || '').normalize('NFKC'));
  const countDefinitions = (definitions) => definitions.map((item) => ({
    ...item,
    count: source.reduce((count, title) => count + Number(containsAlias(title, item.aliases)), 0)
  })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ja')).slice(0, limit);
  const sizeCounts = new Map();
  for (const title of source) {
    const found = new Set((title.match(SIZE_PATTERN) || []).map((value) => value.replace(/\s+/gu, '')));
    for (const size of found) sizeCounts.set(size, (sizeCounts.get(size) || 0) + 1);
  }
  const sizes = [...sizeCounts.entries()].map(([value, count]) => ({ value, label: value, query: value, aliases: [value], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ja')).slice(0, limit);
  return { colors: countDefinitions(SHOP_COLOR_FILTERS), sizes, materials: countDefinitions(SHOP_MATERIAL_FILTERS) };
}

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
