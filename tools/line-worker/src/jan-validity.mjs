// JAN/GTIN が「1 つの商品を指す」と言えるかの判定（共通の置き場所）。
// 2026-10-25（#706）: `JAN:0000000000000` に 19 店舗・17 商品名が混ざった。その時は SEO から外しただけだった。
// 2026-11-14 大隆さん「最安案内の指示書・追記」: 無効・共通の JAN や店内コードを根拠に、別の店の商品を同じ商品として
// まとめない（取込の商品キー・同一商品判定・検索結果の重複まとめで同じ判定を使う）。
// 条件: 8/13 桁・同じ数字の並びでない・GS1 の店内コード（13 桁 02/04/2x、8 桁 0/2 始まり）でない・チェックデジット一致。
export function isUniqueJan(value) {
  const jan = String(value || '');
  if (!/^(?:\d{8}|\d{13})$/u.test(jan) || /^(\d)\1+$/u.test(jan)) return false;
  if (jan.length === 13 ? /^(?:0[24]|2)/u.test(jan) : /^[02]/u.test(jan)) return false;
  const digits = [...jan].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// Only JAN-prefixed keys are in scope; merchant-specific keys are unchanged.
export function isInvalidJanProductKey(value) {
  const key = String(value ?? '').trim();
  return /^JAN:/iu.test(key) && !isUniqueJan(key.slice(4));
}
