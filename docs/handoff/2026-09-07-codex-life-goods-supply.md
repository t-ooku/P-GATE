# 生活用品の商品取得経路：今週の実行判断

2026-09-07。新規有料契約・大量取得は実行していない。

## 判断

まず既存の楽天・Yahoo!のライブ検索を生活用品の代表検索で検証する。
productsの326,483件は自社DBの件数であり、モールの検索可能商品数ではない。
「DBに化粧水がない」ことと「化粧水を取得できない」ことを分けて測る。
価格保存は通常検索の楽天応答から開始した。検索用の全カタログを無期限保存する設計にはしない。

| 経路 | 既存実装・公式機能 | 今週の用途 | 未解決 |
|---|---|---|---|
| 楽天市場商品検索API | keyword、shopCode。公式はgenreId/itemCodeも提供 | 収納・猫トイレ・上履き・扇風機・歯ブラシのライブ検索。通常応答の価格を23時間保存 | 楽天ID付き巡回はitemCodeで直接取得する修正を反映。カテゴリ指定の既存検索への接続は未実装。価格表示の取得日時条件も別途必要 |
| Yahoo!商品検索API v3 | query、JAN、seller_id。公式はgenre_category_id/in_stock/価格範囲等も提供 | 既存JAN照合、生活用品の出店者内検索、楽天と結果を比較 | 永続価格保存の許容期間が未確定。今回は保存しない |
| セラー本人の商品フィード | 既存seller連携・marketplace_offers | 権限のある事業者から生活用品の価格・在庫を受領 | marketplace_offers=0。送信待ち5件は商品提供合意ではない |
| Amazon Creators / SP-API | アカウント・API別の条件が必要 | 既存の正規接続と利用資格の確認を先に行う | 現在の稼働・価格追跡に必要な別途合意を確認するまで保存対象にしない |

ソースコード：`tools/line-worker/src/rakuten-marketplace-api.mjs`、
`tools/line-worker/src/yahoo-shopping-api.mjs`、`tools/line-worker/src/yahoo-request-coordinator.mjs`。

## 公式根拠

- [楽天市場商品検索API](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)：検索パラメータと返却情報。
- [楽天キャッシュ条件](https://webservice.faq.rakuten.net/hc/ja/articles/900001974343)：価格・販売可能情報24時間。実装は23時間。
- [Yahoo!商品検索API v3](https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html)：検索・JAN・カテゴリ・ストア等の指定。
- [Yahoo!ガイドライン](https://developer.yahoo.co.jp/guideline/)：[共通利用規約](https://www.lycorp.co.jp/ja/company/terms/)も確認したが、価格保存の確定時間は今回確認できず。
- [Amazonアソシエイト運営ポリシー](https://affiliate.amazon.co.jp/help/operating/policies/)：価格追跡・アラートの別途合意とAPI利用条件を確認する必要がある。

## Coworkへの確認事項

1. Gemini作成の検索能力活用指示書の原文、Coworkによる改善後の最新版、更新履歴・格納先。GPTの再開指示書とは別資料として必要。
2. 既存3ウォッチの所有者による商品再選択・保存。商品名だけからIDを推測補完しない。
3. 9/7の次回巡回後、理由別観測件数と通知結果。0件ならcron実行ログ・失敗箇所を確認する。
4. 実機でTurnstile確認を完了できる通常画面の5検索E2E。内部QAの成功と実機成功を分ける。
5. AmazonのAPI種別・価格追跡の合意証跡、Yahoo!の価格キャッシュ時間に関する公式回答・契約条件。
6. 9/8初回営業のsent/delivered/bounce/unsubscribe/response。sentだけで配送到達としない。
7. 今夜20:15 JSTの旧AI-actress Xと新Runway Xの両APPROVED行について、運用意図と重複の有無を確認。公開済みとは扱わない。

このファイルは確認事項の引継ぎ資料。Coworkへの外部メッセージ送信は行っていない。

Yahoo!の[商品コード検索API](https://developer.yahoo.co.jp/webapi/shopping/shopping/v1/itemlookup.html)は公式に存在する。現行の共通レート制御経路への接続と実応答検証は未実装。ID比較自体は実装済みだが、Yahoo!でのID直接取得まで完了したとは扱わない。
