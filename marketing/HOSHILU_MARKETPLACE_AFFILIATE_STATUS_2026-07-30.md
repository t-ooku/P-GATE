# HOSHILU モール横断・アフィリエイト確認状況

更新日: 2026-08-01
最終一次情報確認: 2026-08-01

## 実装方針

- Amazon、楽天市場、Qoo10、SHEINは全ジャンル共通の主力4モールとして維持する。
- アパレル検索に限り、ZOZOTOWN、SHOPLIST、MUSINSA、BUYMA、SNKRDUNKの検索導線を追加する。
- 食事・デリバリー検索は、住所・時刻依存と商品データ契約の複雑さに対してHOSHILUの商品検索体験から外れるため、2026-07-31に採用を見送った。
- 商品カードの「○○で見る」は、確認済みの商品詳細URLがあるモールだけ表示する。
- 2026-08-01に9モール共通の商品URL検証・フィード取込・7日鮮度診断・署名付き商品提示を実装した。
- 追加5モールは技術的に商品提示可能だが、正式フィードまたは個別許諾を受領するまで実商品データを自動取得しない。
- 検索結果ページへ送る導線は「出品確認済み」と扱わず、横断検索枠だけに表示する。
- アフィリエイトURLは、各プログラムの承認とリンク利用条件を確認できたものだけ採用する。

## 現在の状況

| モール | 横断検索 | 商品詳細URL | アフィリエイト | 次の作業 |
|---|---:|---:|---|---|
| Amazon | 稼働中 | Creators API・承認済みURL | Amazonアソシエイト導入済み | 規約表示と成果確認を継続 |
| 楽天市場 | 稼働中 | 楽天API・フィード対応 | `affiliateUrl` 優先処理を実装済み | 法人利用条件と成果レポートを継続確認 |
| Qoo10 | 稼働中 | 商品フィード対応 | 公式キュレーター制度あり、未接続 | HOSHILU媒体登録・商品リンク発行条件を確認 |
| SHEIN | 稼働中 | 商品フィード対応 | 公式Affiliate Programあり、未接続 | 日本向け媒体審査とディープリンク条件を確認 |
| ZOZOTOWN | アパレル検索のみ稼働中 | 取込・検証基盤対応、データ未接続 | 公開公式ページでは確認できず | 商品フィード、画像・価格利用、更新頻度、媒体提携可否を公式またはASPへ照会 |
| SHOPLIST | アパレル検索のみ稼働中 | 取込・検証基盤対応、データ未接続 | 公開公式ページでは確認できず | 商品URL実例を含む正式フィードとWeb媒体提携可否を公式またはASPへ照会 |
| MUSINSA | アパレル検索のみ稼働中 | 取込・検証基盤対応、データ未接続 | 韓国向け公式「MUSINSA Curator」は商品リンク共有と最大10%を案内 | 日本向けWeb媒体・日本送客・商品データ・精算対象か確認 |
| BUYMA | アパレル検索のみ稼働中 | 取込・検証基盤対応、データ未接続 | Personal Shopper APIは出品者自身の商品・注文管理向け。市場横断の公開商品検索APIではない | メディア提携または許諾済み商品フィードをBUYMAへ照会 |
| SNKRDUNK | アパレル検索のみ稼働中 | 取込・検証基盤対応、データ未接続 | HOSHILU向け承認なし | Web媒体提携、商品URLフィード、画像・価格・在庫条件を公式窓口へ確認 |
| Uber Eats | 採用見送り | 未接続 | 公式Affiliate Programあり、未申請・未承認 | HOSHILUへ掲載・収益リンク化しない |
| 出前館 | 採用見送り | 未接続 | HOSHILU向け承認なし | HOSHILUへ掲載しない |
| menu | 採用見送り | 未接続 | 公開公式情報で確証なし | HOSHILUへ掲載しない |
| Rocket Now | 採用見送り | 未接続 | 公開公式情報で確証なし | HOSHILUへ掲載しない |
| Temu | 未掲載 | 未接続 | 未確認 | 国籍だけで危険判定せず、商品安全・販売者表示・個人情報・日本向け媒体審査・商品データ条件を確認してから判定 |

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
- BUYMA Personal Shopper API: https://specification.personal-shopper-api.buyma.com/en/
- BUYMA Product API: https://specification.personal-shopper-api.buyma.com/en/api/products_json/
- SNKRDUNK検索: https://snkrdunk.com/search/
- SNKRDUNKカテゴリ: https://snkrdunk.com/categories
- Uber Affiliate Program: https://www.uber.com/jp/ja/affiliate-program/
- 出前館Developer: https://developer.demae-can.com/
- menu店舗規約: https://store.menu.jp/shopterms/
- Rocket Now: https://www.rocketnow.co.jp/
- Temuプライバシーポリシー: https://www.temu.com/jp-en/privacy-and-cookie-policy.html

## 導入判定

1. HOSHILUのWebサイトまたは公式SNSを媒体として登録できる。
2. 検索結果または商品詳細へのディープリンクが認められる。
3. API・商品画像・価格・在庫データの利用条件を満たす。
4. 広告・アフィリエイト表記をHOSHILUとSNSの両方へ表示できる。
5. 成果計測用パラメータをHOSHILUの署名付き転送URLに安全に内包できる。

上記を満たさないモールは、通常の検索導線としてのみ提供し、成果報酬が発生すると表示しない。

## 収益リンク安全状態

- 追加5モールはすべて通常検索URLであり、アフィリエイトURLとして扱わない。
- デリバリー4社は採用見送り。検索導線・通知・SNS訴求・収益見込みへ含めない。
- MUSINSA Curatorは制度の存在だけ確認済み。日本向け適用が確認できるまで収益見込みへ計上しない。
- ZOZOTOWN、SHOPLIST、BUYMAは公開公式情報だけではメディア向け提携条件を確定できないため、未承認のパラメータや第三者生成リンクを付けない。
- 商品画像・価格・在庫・店舗・メニューは、公式API、正式フィード、または個別許諾を得るまで追加モールおよびデリバリー各社から取得しない。
