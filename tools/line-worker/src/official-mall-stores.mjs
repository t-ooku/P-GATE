// 楽天市場・Yahoo!ショッピング内に出店している「モール公式店」の判定。
//
// 2026-08-18の調査で、13モールのうちZOZOTOWN・ハンズ・マツキヨ・@cosme・
// ABC-MARTの5モールが楽天/Yahoo!内に公式店を持つことを確認した
// (各店舗ページで一次確認済み)。既に稼働中の楽天API・Yahoo!APIの検索結果に
// これらの店舗の商品が含まれるため、新しい契約や審査なしで「そのモールの
// 商品」を提示できる。
//
// 方針(ユーザー指示 2026-08-18):「アフィリエイト報酬対象でなくてもよいから、
// 検索したらあらゆるモールの商品が提示されることが最優先。提示反映基準は
// ルールに基づき平等に」。この判定は表示ラベルの付与だけを行い、順位には
// 一切影響させない(順位は従来どおりtotal_cost昇順などモール中立のまま)。
//
// marketplace自体は書き換えない。オファーのmarketplaceを'ZOZOTOWN_JP'等へ
// 変えると、送客計測(outbound_commerce_events)・URL検証
// (isMarketplaceProductUrl)・D1のCHECK制約まで波及するため、
// official_store という追加情報として持たせ、UI側でラベル表示にだけ使う。
//
// 正直な表示のため、ラベルには必ず「◯◯店」と取得元を明記する。モール本体の
// 品揃え・価格と公式モール内店舗のそれは完全一致しない可能性があるため、
// 「ZOZOTOWN」とだけ表示してモール本体と誤認させることはしない。

const RAKUTEN_OFFICIAL_SHOPS = Object.freeze({
  'hands-net': { marketplace: 'HANDS_JP', label: 'ハンズ公式 楽天市場店' },
  'matsukiyo': { marketplace: 'MATSUKIYO_JP', label: 'マツキヨ公式 楽天市場店' },
  'cosmecomonline': { marketplace: 'COSME_JP', label: '@cosme公式 楽天市場店' },
  'abc-mart': { marketplace: 'ABCMART_JP', label: 'ABC-MART公式 楽天市場店' }
});

const YAHOO_OFFICIAL_SELLERS = Object.freeze({
  'zozo': { marketplace: 'ZOZOTOWN_JP', label: 'ZOZOTOWN公式 Yahoo!店' },
  'hands-net': { marketplace: 'HANDS_JP', label: 'ハンズ公式 Yahoo!店' },
  'matsumotokiyoshi': { marketplace: 'MATSUKIYO_JP', label: 'マツキヨ公式 Yahoo!店' },
  'cosmecom': { marketplace: 'COSME_JP', label: '@cosme公式 Yahoo!店' }
});

// 商品URLから公式店を判定する。該当しなければnull。
// 対応URL形式(どちらも当該APIが返す正規の商品URL):
//   楽天:  https://item.rakuten.co.jp/{shopCode}/{itemId}/
//          (hb.afl.rakuten.co.jp のアフィリエイトURLは pc= に実URLを持つ)
//   Yahoo: https://store.shopping.yahoo.co.jp/{sellerId}/{itemCode}.html
export function officialStoreForProductUrl(value) {
  const source = String(value || '').trim();
  if (!source) return null;
  let url;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'hb.afl.rakuten.co.jp') {
    const inner = url.searchParams.get('pc') || url.searchParams.get('m') || '';
    return inner && inner !== source ? officialStoreForProductUrl(inner) : null;
  }
  const segment = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase() || '';
  if (!segment) return null;
  if (host === 'item.rakuten.co.jp') return RAKUTEN_OFFICIAL_SHOPS[segment] || null;
  if (host === 'store.shopping.yahoo.co.jp') return YAHOO_OFFICIAL_SELLERS[segment] || null;
  return null;
}
