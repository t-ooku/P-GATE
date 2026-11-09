# Search Console robots通知PDCA — 2026-11-09

## ユーザー依頼と取得範囲
ユーザーはhoshilu.app「robots.txtによりブロック」のメール画像を共有しPDCAを依頼。通知に個別URL・件数なし。画像だけから公開主要ページが誤遮断されたとは断定しない。
Gmail検索で当該メールは取得できず。Windsorのsearchconsole接続はhttps://hoshilu.app/ とsc-domain:hoshilu.appが存在。fields/optionsを確認したがPage Indexing理由別例URL・URL Inspectionは未対応。Search Consoleブラウザは紹介画面（管理セッション未認証）で、個別レポートは未取得。認証情報の抽出・再利用・権限拡大なし。

## Plan / Do（読取監査実施）
本番robots.txt GET200、Allow:/、除外/api/・/go・/line/・/shop/*?。tools/line-worker/public/robots.txtと一致。/goは10/31のクローラ送客過多、/line/は11/8の副作用ある入口、shop絞込は無限URL対策。これらを一括解除しない。/line/watch、/go、APIの実行は行っていない。
2026-11-09に本番GETで標準sitemap158 URL全件＋商品mapの先頭12件＋genre mapの先頭12件＝182 URLを監査。全件最終HTTP200、転送0、self-canonical一致、検査対象でrobots遮断0。商品map全2009件・genre map全26件を全件GETしたとは言わない。robotsマッチャーは標準RobotFileParserなのでGoogle独自wildcard規則の完全同等性は主張しない（今回の母集団は/shopのqueryパスなし）。

## Check：別件のnoindex不整合は今回も再現
動的genre mapに掲載された検査12件中8件がnoindex,follow：
- /media/genre/womens-sneakers
- /media/genre/mobile-battery
- /media/genre/face-lotion
- /media/genre/kids-baby
- /media/genre/food
- /media/genre/sweets
- /media/genre/daily-goods
- /media/genre/kitchen
これはrobots.txtの遮断と別。今朝selfcheckの10件と母集団/時刻が異なるため、10→8の改善や悪化とは言わない。全26ジャンルの現在値でもない。
本件は既存のgenre-sitemap-noindex依頼・日次改善責任者と重複/競合する新規実装を開始せず、同じ責任者が判定入力とキャッシュ時点差を再現し必要な修正を実行する。indexフラグ強制・サイトマップ数固定はしない。今回の通知原因と同定したわけではない。

## 基準値
Windsor、GSC確定データのみ11/1〜6（PT）で90表示3クリック（CTR3.33%）。6日参考値で完全7日/月間ではない。sitemap.xmlは提出158、最終取得2026-11-09T05:27:21.019Z、errors0/warnings0。商品mapの提出1852と現在GET2009は観測時刻が異なりindex数ではない。
/health今回GETでok=true/missing0/weak0、X/Instagram connected=true・Runway ready=true・database_features全true。本週Seller QA job DONE確認。既存#369/#691を今回の新規検索障害としない。

## Act / 次の実行条件
- 通知対象URL一覧/CSVが得られたら、管理/API/転送/絞込の意図的除外と公開ページ誤除外を分類し、後者だけ原因修正・回帰テスト・既存配備・本番GET・GSC再検証を行う。
- 個別例・Google側の登録/再検証状態は現在未取得、修復完了と呼ばない。
- 新規定期タスクなし。既存「HOSHILU日次改善・KPI報告」（改善実装責任者）へ今回の追跡を追記済み。7/14/28日比較は修正が本番確認された日D0から。保育HPの133 URL canonical不整合修正は別リポジトリ/別日報で管理。
- Claudeへ同じ点検を再依頼しない。直接起動したとは言わない。新規D1書込・有料probe・SNS/営業・料金/規約変更なし。
