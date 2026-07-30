# HOSHILU モール横断・アフィリエイト確認状況

更新日: 2026-07-30
最終一次情報確認: 2026-07-30

## 実装方針

- Amazon、楽天市場、Qoo10、SHEINは全ジャンル共通の主力4モールとして維持する。
- アパレル検索に限り、ZOZOTOWN、SHOPLIST、MUSINSA、BUYMAの検索導線を追加する。
- 商品カードの「○○で見る」は、確認済みの商品詳細URLがあるモールだけ表示する。
- 検索結果ページへ送る導線は「出品確認済み」と扱わず、横断検索枠だけに表示する。
- アフィリエイトURLは、各プログラムの承認とリンク利用条件を確認できたものだけ採用する。

## 現在の状況

| モール | 横断検索 | 商品詳細URL | アフィリエイト | 次の作業 |
|---|---:|---:|---|---|
| Amazon | 稼働中 | Creators API・承認済みURL | Amazonアソシエイト導入済み | 規約表示と成果確認を継続 |
| 楽天市場 | 稼働中 | 楽天API・フィード対応 | `affiliateUrl` 優先処理を実装済み | 法人利用条件と成果レポートを継続確認 |
| Qoo10 | 稼働中 | 商品フィード対応 | 公式キュレーター制度あり、未接続 | HOSHILU媒体登録・商品リンク発行条件を確認 |
| SHEIN | 稼働中 | 商品フィード対応 | 公式Affiliate Programあり、未接続 | 日本向け媒体審査とディープリンク条件を確認 |
| ZOZOTOWN | アパレル検索のみ稼働中 | 未接続 | 公開公式ページでは確認できず | ASP管理画面またはZOZOへ提携可否を照会 |
| SHOPLIST | アパレル検索のみ稼働中 | 未接続 | 公開公式ページでは確認できず | ASP管理画面またはSHOPLISTへ提携可否を照会 |
| MUSINSA | アパレル検索のみ稼働中 | 未接続 | 韓国向け公式「MUSINSA Curator」は商品リンク共有と最大10%を案内 | 日本向けHOSHILU Web媒体・日本送客・精算対象か確認 |
| BUYMA | アパレル検索のみ稼働中 | 未接続 | 公開公式ページではメディア向け制度の確証不足 | BUYMAまたはASPへメディア提携を照会 |

## 公式確認先

- Amazonアソシエイト: https://affiliate.amazon.co.jp/welcome
- 楽天アフィリエイト: https://affiliate.rakuten.co.jp/
- Qoo10キュレーター: https://www.qoo10.jp/gmkt.inc/mobile/sns/curatorhowto.aspx
- SHEIN Affiliate Program: https://jp.shein.com/affiliate-a-427.html/
- MUSINSA Curator: https://www.musinsa.com/curator/intro/pro
- MUSINSA Curator規約: https://www.musinsa.com/curator/terms
- ZOZOTOWN: https://zozo.jp/
- SHOPLIST: https://shop-list.com/
- BUYMA: https://www.buyma.com/

## 導入判定

1. HOSHILUのWebサイトまたは公式SNSを媒体として登録できる。
2. 検索結果または商品詳細へのディープリンクが認められる。
3. API・商品画像・価格・在庫データの利用条件を満たす。
4. 広告・アフィリエイト表記をHOSHILUとSNSの両方へ表示できる。
5. 成果計測用パラメータをHOSHILUの署名付き転送URLに安全に内包できる。

上記を満たさないモールは、通常の検索導線としてのみ提供し、成果報酬が発生すると表示しない。

## 収益リンク安全状態

- 追加4モールはすべて通常検索URLであり、アフィリエイトURLとして扱わない。
- MUSINSA Curatorは制度の存在だけ確認済み。日本向け適用が確認できるまで収益見込みへ計上しない。
- ZOZOTOWN、SHOPLIST、BUYMAは公開公式情報だけではメディア向け提携条件を確定できないため、未承認のパラメータや第三者生成リンクを付けない。
- 商品画像・価格・在庫は、公式API、正式フィード、または個別許諾を得るまで追加4モールから取得しない。
