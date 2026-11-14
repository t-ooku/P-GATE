// 同じ商品だけを比べるための照合（2026-11-14 大隆さん指示書 P3 / Cowork 依頼）。
//
// ブランド＋正式名（product-identity-matching.mjs の tier 4）で一致しても、
// 色番・容量・入り数・本体/詰替・通常/ミニ・単品/セット・商品状態が違えば
// 別商品として価格比較してはいけない。このモジュールは商品名（と属性）から
// それらを決定的に取り出し、3 値（same / different / unconfirmed）で比べる。
//
// 原則:
// - 書いていないものは null。推測で埋めない。
// - unconfirmed を same に寄せない（呼び出し側は same のときだけ一致にする）。
// - 店の宣伝（ポイント10倍・11月15日・【公式】・送料無料 など）を色番・容量と
//   読み違えないよう、先に取り除いてから読む。
//
// 色番の扱い:
// - 「#04」「04」「S04」は別の表記として値を保つ（"#04" / "04" / "S04"）。
//   数字だけ同じで接頭辞（# の有無）だけ違う場合は unconfirmed、英字接頭辞が
//   違う（04 と S04）場合は different。
// - 1 つの名前に色番が複数（01・04・05、03/04/05/06）や「全6色」「選べる」が
//   あれば MULTIPLE（1 色に決まらない）＝比べると unconfirmed。
// - 両方とも色番の記載が一切ない商品（家電・雑貨など色番という概念がない
//   もの）は、色番を比較項目にしない。片方だけ色番がある場合は unconfirmed。

export const VARIANT_SAME = 'same';
export const VARIANT_DIFFERENT = 'different';
export const VARIANT_UNCONFIRMED = 'unconfirmed';
export const MULTIPLE = 'MULTIPLE';

const PROMO_PATTERNS = [
  /\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*\d{1,2}\s*[:：]\s*\d{2})?/g,
  /\d{4}\s*年(?:\s*\d{1,2}\s*月)?/g,
  /\d{1,2}\s*[:：]\s*\d{2}/g,
  /ポイント\s*(?:最大)?\s*\d+(?:\.\d+)?\s*倍/gi,
  /\bP\s*\d+\s*倍/gi,
  /最大\s*\d+(?:\.\d+)?\s*(?:%|倍|円|OFF)?/gi,
  /\d+(?:\.\d+)?\s*%\s*(?:OFF|オフ|還元|引き?)?/gi,
  /\d[\d,]*\s*円(?:\s*(?:OFF|オフ|引き?|クーポン|以上))?/gi,
  /\d+\s*時間(?:限定)?/g,
  /\d+\s*(?:日間|週間|ヶ月|か月|カ月)/g,
  /送料無料/g,
  /【\s*公式\s*】|公式(?:ショップ|ストア|店)?/g,
  /あす楽|即納|翌日配送|正規品|国内正規品/g,
  /クーポン(?:利用)?/g,
  /\d+\s*(?:代|位|冠|周年|年連続)/g
];

const UNIT_AFTER_NUMBER = '(?:g|kg|mg|ml|l|cc|oz|cm|mm|m|本|個|枚|袋|箱|包|缶|足|種|色|倍|%|円|時|日|月|年|分|秒|代|位|回|粒|錠|包|入|組|セット|パック|インチ|型|w|v|mah|gb|tb)';

function preprocess(name) {
  let text = String(name ?? '').normalize('NFKC');
  for (const pattern of PROMO_PATTERNS) text = text.replace(pattern, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function parseAttributes(attributes) {
  if (!attributes) return {};
  if (typeof attributes === 'string') {
    try { return JSON.parse(attributes) || {}; } catch { return {}; }
  }
  return typeof attributes === 'object' ? attributes : {};
}

function firstAttribute(parsed, keys) {
  for (const key of keys) {
    const value = parsed?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function reduceValues(values) {
  const unique = [...new Set(values.filter((v) => v !== null && v !== undefined))];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  return MULTIPLE;
}

function normalizeColorToken(token) {
  const t = String(token).normalize('NFKC').toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^(#|[A-Z]{1,2})?(\d{1,3})$/);
  if (!m) return null;
  return `${m[1] || ''}${m[2]}`;
}

function extractColor(text, parsed) {
  const fromAttr = firstAttribute(parsed, ['color_code', 'color_number', 'shade', 'color']);
  if (fromAttr) {
    const token = normalizeColorToken(fromAttr);
    if (token) return token;
  }
  if (/全\s*\d+\s*色|選べる|\d+\s*色(?:から|より)?\s*選|カラー\s*を?\s*選|色\s*を?\s*選/.test(text)) return MULTIPLE;

  const values = [];
  // 「01・04・05」「03/04/05/06」のような列挙は複数色。
  const listPattern = /(?<![0-9A-Za-z.#\-])(?:#?\d{2,3})(?:\s*[・/,、]\s*#?\d{2,3})+(?![0-9.])/g;
  if (listPattern.test(text)) return MULTIPLE;

  // #04
  for (const m of text.matchAll(/#\s?(\d{1,3})(?![0-9.])/g)) values.push(`#${m[1]}`);
  // S04 のような英字1-2文字＋数字の独立トークン
  for (const m of text.matchAll(/(?<![0-9A-Za-z#\-&])([A-Za-z]{1,2})(\d{2,3})(?![0-9A-Za-z.])/g)) {
    values.push(`${m[1].toUpperCase()}${m[2]}`);
  }
  // 単独の2-3桁の数字（単位が続かないもの）
  const bare = new RegExp(`(?<![0-9A-Za-z.#\\-/&])(\\d{2,3})(?![0-9.]|\\s*${UNIT_AFTER_NUMBER}|\\s*[×xX*])`, 'gi');
  for (const m of text.matchAll(bare)) values.push(m[1]);
  return reduceValues(values);
}

function normalizeCapacity(num, unit) {
  let value = Number.parseFloat(num);
  let u = unit.toLowerCase();
  if (!Number.isFinite(value)) return null;
  if (u === 'kg') { value *= 1000; u = 'g'; }
  if (u === 'l') { value *= 1000; u = 'ml'; }
  if (u === 'cc') u = 'ml';
  return `${Number(value.toFixed(3))}${u}`;
}

function extractCapacity(text, parsed) {
  const fromAttr = firstAttribute(parsed, ['capacity', 'volume', 'weight', 'net_content']);
  if (fromAttr) {
    const m = String(fromAttr).normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*(kg|mg|g|ml|l|cc|oz)\b/i);
    if (m) return normalizeCapacity(m[1], m[2]);
  }
  const values = [];
  for (const m of text.matchAll(/(?<![0-9A-Za-z.])(\d+(?:\.\d+)?)\s*(kg|mg|g|ml|l|cc|oz)(?![A-Za-z])/gi)) {
    values.push(normalizeCapacity(m[1], m[2]));
  }
  return reduceValues(values);
}

function extractPackCount(text, parsed) {
  const fromAttr = firstAttribute(parsed, ['pack_count', 'quantity', 'count']);
  if (fromAttr && /^\d+$/.test(fromAttr)) return Number(fromAttr);
  const values = [];
  for (const m of text.matchAll(/(\d+)\s*(?:本|個|枚|袋|箱|包|缶|足|点)\s*(?:セット|入り?|組|パック)/g)) values.push(Number(m[1]));
  for (const m of text.matchAll(/(?<![0-9A-Za-z])(\d+)\s*(?:セット|パック|個パック)/g)) values.push(Number(m[1]));
  // 「1個」「2袋」のような単独の入り数（「3個口」は配送の数なので除く）。
  for (const m of text.matchAll(/(?<![0-9A-Za-z.])(\d+)\s*(?:個|袋|箱|缶|枚|足|点)(?!口|目)/g)) values.push(Number(m[1]));
  for (const m of text.matchAll(/(?<!\d)\s*(?:×|\*|(?<![A-Za-z])[xX])\s*(\d+)(?![0-9.]|\s*(?:cm|mm|m\b|g|ml))/g)) values.push(Number(m[1]));
  const counted = values.filter((n) => Number.isFinite(n) && n > 0);
  return reduceValues(counted);
}

function extractRefill(text) {
  const refill = /詰め?替え?|つめかえ|詰替|refill|リフィル|レフィル/i.test(text);
  const body = /本体(?!価格)/.test(text);
  if (refill && body) return MULTIPLE;
  if (refill) return 'refill';
  if (body) return 'body';
  return null;
}

function extractSizeClass(text) {
  if (/ミニ(?!マム|オン|ストップ|カー|バン)|(?<![A-Za-z])mini(?![A-Za-z])|ミニサイズ/i.test(text)) return 'mini';
  return null;
}

function extractSetType(text) {
  if (/選べる\s*\d*\s*(?:種|色|個|点|タイプ)?/.test(text)) return 'set';
  if (/セット|トリオ|デュオ|詰め?合わせ|アソート|福袋|\d+\s*種\s*(?:入|セット)/.test(text)) return 'set';
  if (/単品|バラ売り/.test(text)) return 'single';
  return null;
}

const CONDITION_PATTERNS = [
  ['parallel_import', /並行輸入|海外版|輸入品/],
  ['bargain', /訳あり|わけあり|ワケあり|B級品|難あり|箱潰れ|パッケージ不良/],
  ['used', /中古|リユース|ユーズド|再生品|リファービッシュ|整備済/],
  ['outlet', /アウトレット|展示品|開封品/]
];

function extractCondition(text) {
  const found = CONDITION_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  return found.length ? found.sort().join('+') : null;
}

// 商品名と属性から、比較に使う項目を取り出す。書いていないものは null。
export function variantAttributes(name, attributes) {
  const parsed = parseAttributes(attributes);
  const text = preprocess(name);
  return {
    color: extractColor(text, parsed),
    capacity: extractCapacity(text, parsed),
    pack_count: extractPackCount(text, parsed),
    refill: extractRefill(text),
    size_class: extractSizeClass(text),
    set_type: extractSetType(text),
    condition: extractCondition(text)
  };
}

function toVariant(input) {
  if (input === null || input === undefined) return variantAttributes('');
  if (typeof input === 'string') return variantAttributes(input);
  if (typeof input === 'object' && 'color' in input && 'capacity' in input && 'condition' in input) return input;
  return variantAttributes(input.title ?? input.name ?? input.normalized_title ?? '', input.attributes);
}

function compareColor(a, b) {
  if (a === null && b === null) return 'na';
  if (a === null || b === null) return VARIANT_UNCONFIRMED;
  if (a === MULTIPLE || b === MULTIPLE) return VARIANT_UNCONFIRMED;
  if (a === b) return VARIANT_SAME;
  const pa = a.match(/^(#|[A-Z]{1,2})?(\d+)$/);
  const pb = b.match(/^(#|[A-Z]{1,2})?(\d+)$/);
  if (pa && pb) {
    const prefixA = pa[1] || '';
    const prefixB = pb[1] || '';
    const sameDigits = Number(pa[2]) === Number(pb[2]);
    // 「#04」と「04」は # の有無だけの違い。同じとも別とも言えないので未確認。
    if (sameDigits && (prefixA === '#' || prefixB === '#') && /^#?$/.test(prefixA) && /^#?$/.test(prefixB)) {
      return VARIANT_UNCONFIRMED;
    }
  }
  return VARIANT_DIFFERENT;
}

// 両方に書いてあれば比べる。片方だけ・複数のときは null（＝判断材料にしない）
// か unconfirmed を返す。
function compareBoth(a, b, { oneSided = 'ignore' } = {}) {
  if (a === null && b === null) return 'na';
  if (a === null || b === null) {
    if (oneSided === 'different') return VARIANT_DIFFERENT;
    if (oneSided === 'unconfirmed') return VARIANT_UNCONFIRMED;
    return 'na';
  }
  if (a === MULTIPLE || b === MULTIPLE) return VARIANT_UNCONFIRMED;
  return a === b ? VARIANT_SAME : VARIANT_DIFFERENT;
}

// 2 つの商品（名前・offer・variantAttributes の結果のどれでも可）を比べる。
// 結果は same / different / unconfirmed の 3 つだけ。
export function compareVariants(a, b) {
  const va = toVariant(a);
  const vb = toVariant(b);
  const results = [
    compareColor(va.color, vb.color),
    compareBoth(va.capacity, vb.capacity),
    // 入り数・単品/セットが片方だけ書いてある場合、何個分の価格か分からないので未確認。
    compareBoth(va.pack_count, vb.pack_count, { oneSided: 'unconfirmed' }),
    compareBoth(va.set_type, vb.set_type, { oneSided: 'unconfirmed' }),
    // 詰替・ミニ・並行輸入/訳あり/中古/アウトレットは、書いていない側が通常品で
    // あることが普通なので、片方だけにあれば別商品として扱う。
    compareBoth(va.refill === 'body' ? null : va.refill, vb.refill === 'body' ? null : vb.refill, { oneSided: 'different' }),
    compareBoth(va.size_class, vb.size_class, { oneSided: 'different' }),
    compareBoth(va.condition, vb.condition, { oneSided: 'different' })
  ];
  if (results.includes(VARIANT_DIFFERENT)) return VARIANT_DIFFERENT;
  if (results.includes(VARIANT_UNCONFIRMED)) return VARIANT_UNCONFIRMED;
  return VARIANT_SAME;
}
