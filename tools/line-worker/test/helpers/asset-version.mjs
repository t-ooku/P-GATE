// 2026-09-21 主幹指示書の運用改善: UI を1行直すたびに 6 つのテストへ散らばった
// `app.js?v=NNN` の literal を全部書き換える必要があり、パッチが肥大して転記ミスの
// 温床になっていた。版番号を pin するのは test/asset-versions.test.mjs の 1 箇所だけにし、
// 他のテストは「版が付いていること」「同じアセットは同じ版であること」だけを見る。
const escape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// html 内で参照されているアセットの版番号を返す（見つからなければ空文字）。
export function assetVersion(html, assetPath) {
  const match = new RegExp(`/${escape(assetPath)}\\?v=(\\d+)`, 'u').exec(String(html || ''));
  return match ? match[1] : '';
}

// 版付きで参照されていること。版番号そのものは問わない。
export function hasVersionedAsset(html, assetPath) {
  return assetVersion(html, assetPath) !== '';
}

// 同じアセットへの参照が複数あるとき、全部同じ版であること（片方だけ上げた事故を防ぐ）。
export function assetVersionsAgree(html, assetPath) {
  const found = [...String(html || '').matchAll(new RegExp(`/${escape(assetPath)}\\?v=(\\d+)`, 'gu'))].map((match) => match[1]);
  return found.length > 0 && found.every((value) => value === found[0]);
}
