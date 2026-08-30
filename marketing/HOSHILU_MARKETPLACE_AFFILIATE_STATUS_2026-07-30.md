# HOSHILU モール横断・アフィリエイト確認状況

更新日: 2026-08-30
最終一次情報確認: 2026-08-30

## 実装方針

- Amazon、楽天市場、Qoo10、SHEINは全ジャンル共通の主力4モールとして維持する。
- 現在の13モールは、Amazon、楽天市場、Yahoo!ショッピング、Qoo10、SHEIN、ZOZOTOWN、ロフト、ハンズ、マツキヨココカラ、@cosme、ABC-MART、BUYMA、SNKRDUNK。
- 食事・デリバリー検索は、住所・時刻依存と商品データ契約の複雑さに対してHOSHILUの商品検索体験から外れるため、2026-07-31に採用を見送った。
- 商品カードの「○○で見る」は、確認済みの商品詳細URLがあるモールだけ表示する。
- 2026-08-01に9モール共通の商品URL検証・フィード取込・7日鮮度診断・署名付き商品提示を実装した。
- ハンズ、マツキヨココカラ、@cosme、ABC-MARTは楽天市場の公式店、ZOZOTOWNはYahoo!ショッピングの公式店を検索する。各ブランドとHOSHILUが別個にアフィリエイト契約したという意味ではない。
- 検索結果ページへ送る導線は「出品確認済み」と扱わず、横断検索枠だけに表示する。
- アフィリエイトURLは、各プログラムの承認とリンク利用条件を確認できたものだけ採用する。

## 現在の状況

| モール | 横断検索 | 商品詳細URL | アフィリエイト | 次の作業 |
|---|---:|---:|---|---|
| Amazon | 稼働中 | Creators API未接続。検証済み商品URLとAmazon検索への外部導線 | 申込完了・ID `hoshilu00-22` 発行済み・最終審査前 | 正式タグ付きリンクを運用し、申込後180日以内の第三者による適格販売3件を確認。承認後かつ直近30日10件以上の適格販売を満たしてからCreators APIを接続 |
| 楽天市場 | 稼働中 | 楽天API接続済み | `RAKUTEN_AFFILIATE_ID` 設定時に `affiliateUrl` を優先する処理を実装済み。2026-08-30時点で本番ID設定の有無は未確認 | 楽天アフィリエイト管理画面と本番Secret名を確認 |
| Yahoo!ショッピング | 稼働中 | Yahoo!商品API接続済み。認証障害Issue #100は別対応中 | バリューコマース申請は審査中との記録。承認完了は未確認 | 審査結果、Yahoo!プログラム提携、商品APIトークンとecCodeを確認 |
| Qoo10 | 稼働中 | 検索導線あり。バリューコマース商品APIアダプタを2026-08-30に実装 | バリューコマースでは即時提携対象との公式案内あり。HOSHILU側の実提携は未確認 | バリューコマース管理画面で提携し、商品APIトークンとQoo10 ecCodeを本番Secretへ設定 |
| SHEIN | 稼働中 | 商品フィード対応 | 公式Affiliate Programあり、未接続 | 日本向け媒体審査とディープリンク条件を確認 |
| ZOZOTOWN | 稼働中 | Yahoo!ショッピング内のZOZOTOWN公式店を商品APIで検索 | Yahoo!側の収益リンクが有効な場合だけその条件を継承。独立提携ではない | Yahoo!アフィリエイト承認後に実リンクを確認 |
| ハンズ・マツキヨココカラ・@cosme・ABC-MART | 稼働中 | 楽天市場内の各公式店を商品APIで検索 | 楽天側の収益リンクが有効な場合だけその条件を継承。独立提携ではない | 楽天アフィリエイトID設定を確認 |
| ロフト | 稼働中 | 検索導線のみ | 承認済み記録なし | ASPまたは公式媒体提携の有無を確認 |
| BUYMA | アパレル検索のみ稼働中 | 取込・検証基盤対応、データ未接続 | Personal Shopper APIは出品者自身の商品・注文管理向け。市場横断の公開商品検索APIではない | メディア提携または許諾済み商品フィードをBUYMAへ照会 |
| SNKRDUNK | アパレル検索のみ稼働中 | 取込・検証基盤対応、データ未接続 | HOSHILU向け承認なし | Web媒体提携、商品URLフィード、画像・価格・在庫条件を公式窓口へ確認 |
| Uber Eats | 採用見送り | 未接続 | 公式Affiliate Programあり、未申請・未承認 | HOSHILUへ掲載・収益リンク化しない |
| 出前館 | 採用見送り | 未接続 | HOSHILU向け承認なし | HOSHILUへ掲載しない |
| menu | 採用見送り | 未接続 | 公開公式情報で確証なし | HOSHILUへ掲載しない |
| Rocket Now | 採用見送り | 未接続 | 公開公式情報で確証なし | HOSHILUへ掲載しない |
| Temu | 未掲載 | 未接続 | 未確認 | 国籍だけで危険判定せず、商品安全・販売者表示・個人情報・日本向け媒体審査・商品データ条件を確認してから判定 |

## 公式確認先

- Amazonアソシエイト: https://affiliate.amazon.co.jp/welcome
- Amazonアソシエイト審査: https://affiliate.amazon.co.jp/help/node/topic/G8TW5AE9XL2VX9VM/
- Amazon Creators API: https://affiliate.amazon.co.jp/creatorsapi
- 楽天アフィリエイト: https://affiliate.rakuten.co.jp/
- バリューコマース Yahoo!ショッピング: https://www.valuecommerce.ne.jp/pickup/yahoo_af/
- バリューコマース SNS掲載可能広告主: https://www.valuecommerce.ne.jp/event/sns/
- バリューコマース商品API: https://pub-docs.valuecommerce.ne.jp/docs/as-63-item-api/
- Qoo10キュレーター: https://www.qoo10.jp/gmkt.inc/mobile/sns/curatorhowto.aspx
- SHEIN Affiliate Program: https://jp.shein.com/affiliate-a-427.html/
- ZOZOTOWN: https://zozo.jp/
- ロフト: https://www.loft.co.jp/store/
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

- Amazonは2026-08-13に申込を完了し、ID `hoshilu00-22` の発行を確認した。最終審査承認、適格販売件数、注文、報酬は未取得であり、0件へ置き換えない。
- Amazon Creators APIは未接続。接続済みの商品検索APIとして表示せず、資格取得・認証情報発行・本番検索成功を確認するまで外部検索導線として扱う。
- バリューコマース商品APIは、媒体審査通過後に発行されるトークンと、提携済み広告主のecCodeが揃った場合だけ有効化する。Secret値をGit、ログ、`/health`へ出さない。
- Yahoo!・Qoo10のバリューコマースリンクは、公式計測ホスト、計測ID、内包された商品詳細URLをすべて検証し、別モールや任意URLへのリダイレクトを拒否する。
- Amazonへの収益リンクは登録IDを付け、サイト上にAmazon指定のアソシエイト開示文と広告表示を掲載する。自己注文を適格販売や目標注文へ算入しない。
- 独立提携を確認できないモールは通常検索URLだけを表示し、アフィリエイトURLとして扱わない。
- デリバリー4社は採用見送り。検索導線・通知・SNS訴求・収益見込みへ含めない。
- ロフト、BUYMA、SNKRDUNKは承認済みの提携記録がないため、収益見込みへ計上しない。
- 商品画像・価格・在庫・店舗・メニューは、公式API、正式フィード、または個別許諾を得るまで追加モールおよびデリバリー各社から取得しない。
