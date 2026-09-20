// Compare only supplied brand hints with actual returned titles/URL paths.
// These are spelling/phonetic comparison keys, never generated search results.
const KANA_ROWS = [
  ['アイウエオ', ['a','i','u','e','o']], ['カキクケコ', ['ka','ki','ku','ke','ko']],
  ['サシスセソ', ['sa','shi','su','se','so']], ['タチツテト', ['ta','chi','tsu','te','to']],
  ['ナニヌネノ', ['na','ni','nu','ne','no']], ['ハヒフヘホ', ['ha','hi','fu','he','ho']],
  ['マミムメモ', ['ma','mi','mu','me','mo']], ['ヤユヨ', ['ya','yu','yo']],
  ['ラリルレロ', ['ra','ri','ru','re','ro']], ['ワヲン', ['wa','wo','n']],
  ['ガギグゲゴ', ['ga','gi','gu','ge','go']], ['ザジズゼゾ', ['za','ji','zu','ze','zo']],
  ['ダヂヅデド', ['da','ji','zu','de','do']], ['バビブベボ', ['ba','bi','bu','be','bo']],
  ['パピプペポ', ['pa','pi','pu','pe','po']], ['ヴ', ['vu']]
];
const KANA_ROMAJI = new Map(KANA_ROWS.flatMap(([kana, romaji]) => [...kana].map((k, i) => [k, romaji[i]])));
for (const [base, prefix] of [['キ','ky'],['シ','sh'],['チ','ch'],['ニ','ny'],['ヒ','hy'],['ミ','my'],['リ','ry'],['ギ','gy'],['ジ','j'],['ビ','by'],['ピ','py']]) {
  for (const [small, vowel] of [['ャ','a'],['ュ','u'],['ョ','o']]) KANA_ROMAJI.set(base + small, prefix + vowel);
}
for (const [kana, romaji] of [['ファ','fa'],['フィ','fi'],['フェ','fe'],['フォ','fo'],['ティ','ti'],['ディ','di'],['ヴァ','va'],['ヴィ','vi'],['ヴェ','ve'],['ヴォ','vo'],['イェ','ye']]) KANA_ROMAJI.set(kana, romaji);
const ROMAJI_KANA = new Map([...KANA_ROMAJI].map(([kana, romaji]) => [romaji, kana]));

function kanaToRomaji(token) {
  let result = '';
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === 'ー') { result += result.match(/[aeiou]$/u)?.[0] || ''; continue; }
    if (ch === 'ッ') {
      const next = KANA_ROMAJI.get(token.slice(i + 1, i + 3)) || KANA_ROMAJI.get(token[i + 1]);
      if (next && !/^[aeioun]/u.test(next)) result += next[0];
      continue;
    }
    const pair = KANA_ROMAJI.get(token.slice(i, i + 2));
    if (pair) { result += pair; i += 1; }
    else if (KANA_ROMAJI.has(ch)) result += KANA_ROMAJI.get(ch);
    else return '';
  }
  return result;
}

function romajiToKana(token) {
  // Approximation for matching only. r/l and b/v are common spelling variants.
  const value = token.replace(/l/gu, 'r').replace(/v/gu, 'b');
  let result = '';
  for (let i = 0; i < value.length;) {
    if (value[i] === value[i + 1] && /[bcdfghjkmprstz]/u.test(value[i])) { result += 'ッ'; i += 1; continue; }
    let found = false;
    for (const size of [3, 2, 1]) {
      const key = value.slice(i, i + size);
      if (key.length !== size || !ROMAJI_KANA.has(key)) continue;
      result += ROMAJI_KANA.get(key); i += size; found = true; break;
    }
    if (found) continue;
    // Brand spellings can end in a bare consonant (LILIB -> リリブ).
    if (i === value.length - 1 && ROMAJI_KANA.has(value[i] + 'u')) {
      result += ROMAJI_KANA.get(value[i] + 'u'); i += 1; continue;
    }
    return '';
  }
  return result;
}

const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase();
const phonetic = (value) => value.replace(/l/gu, 'r').replace(/v/gu, 'b').replace(/y/gu, 'i').replace(/([aeiou])\1+/gu, '$1');
function forms(token) {
  const kana = /^[\p{Script=Katakana}ー]+$/u.test(token);
  if (kana ? token.length < 3 : !/^[a-z]{4,48}$/u.test(token)) return null;
  if (token.length > 48) return null;
  const roman = kana ? kanaToRomaji(token) : token;
  const key = phonetic(roman);
  const phonetics = key ? [key] : [];
  if (kana && key.length >= 5 && /[bcdfghjkmnprstz]u$/u.test(key)) phonetics.push(key.slice(0, -1));
  return { raw: token, kana: kana ? token : romajiToKana(token), phonetics };
}

function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...next) > limit) return limit + 1;
    row = next;
  }
  return row[b.length];
}

function nearScore(a, b, translated = false) {
  if (!a || !b) return 0;
  if (a === b) return translated ? 70 : 100;
  const minimum = Math.min(a.length, b.length);
  const limit = minimum >= 5 ? 2 : minimum >= 4 ? 1 : 0;
  if (!limit) return 0;
  const edit = distance(a, b, limit);
  return edit <= limit ? (translated ? 65 : 95) - edit * 15 : 0;
}

function termScore(hint, candidate) {
  let score = nearScore(hint.raw, candidate.raw);
  score = Math.max(score, nearScore(hint.kana, candidate.kana, true));
  // Japanese titles often concatenate a brand and product type without spaces.
  // Compare only Kana spans; never match arbitrary substrings of Latin words.
  if (hint.kana.length >= 4 && candidate.kana.length > hint.kana.length + 2) {
    for (const size of [hint.kana.length - 1, hint.kana.length, hint.kana.length + 1, hint.kana.length + 2]) {
      for (let start = 0; start + size <= candidate.kana.length; start += 1) {
        score = Math.max(score, nearScore(hint.kana, candidate.kana.slice(start, start + size), true));
      }
    }
  }
  for (const a of hint.phonetics) for (const b of candidate.phonetics) score = Math.max(score, nearScore(a, b, true));
  return score;
}

function terms(text) {
  return [...new Set(normalize(text).match(/[\p{Script=Katakana}ー]+|[a-z]+/gu) || [])].slice(0, 80).map(forms).filter(Boolean);
}

export function rerankGoogleMallItems(items, droppedTokens = []) {
  const hints = [...new Set(droppedTokens.map(normalize))].map(forms).filter(Boolean);
  if (!hints.length) return items.slice();
  const scored = items.map((item, index) => {
    let path = '';
    try { path = decodeURIComponent(new URL(item.url).pathname).slice(0, 2048); } catch {}
    // Domain names and query-string tracking parameters are not brand evidence.
    const candidates = terms(String(item.title || '').slice(0, 200) + ' ' + path);
    let score = 0;
    for (const hint of hints) for (const candidate of candidates) score = Math.max(score, termScore(hint, candidate));
    return { item, index, score };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map(({ item }) => item);
}
