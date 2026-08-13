# HOSHILU 影響アップデート 2026-08-13

## 確認できた公式更新

### Amazon Alexa for Shopping

Amazonは、通常の検索窓へ会話型の買い物支援を統合し、質問への回答、購入履歴・
写真・会話を使ったパーソナライズ、画像を起点にした商品提案を案内している。

HOSHILUでは「通常検索」と「AIで探す」の内部処理を維持しながら、将来は同じ入力欄で
商品名検索・曖昧な相談・カテゴリ探索を受け、入力意図に応じて処理を選ぶ統合UXを
設計候補とする。現時点で画面を即時統合せず、既存の行き止まり防止と検索品質を優先する。

### Yahoo! JAPAN テキスト解析

2026-08-12にテキスト解析MCP Serverと日本語係り受け解析API（UniDic品詞体系準拠・
β版）の提供開始が案内された。本番Query Structurerの代替とはまだ判断しない。
同じ教師クエリで精度・速度・失敗率・利用条件を比較してから採否を決める。

## Yahoo!ショッピングAPIの判断

- 高評価トレンドランキングAPIは利用可能。注文者数やレビュー評価等を組み合わせた
  Yahoo!公式順位、評価、件数、商品URL、公式レビューURLを取得できる。
- HOSHILUのCapability RegistryではYahoo!を `planned` から `available` / `native_api`
  へ変更する。
- 公式ランキングAPI障害時は、既存の商品検索APIによる口コミ件数順へ縮退する。
  両者を同じランキング名で表示しない。
- 商品レビュー本文検索APIは2021-09-30に提供終了している。本文取得・保存・要約は
  実装しない。高評価トレンドランキングが返す評価点・件数・公式レビューURLだけを使う。
- 会員限定価格は利用条件を確認できないため一般向け確認済み価格へ採用しない。
  送料を取得できないランキング応答は総額確認済みとして扱わない。

## 自動検知

デプロイ後のGitHub Actionsで、本番health、設定状態、配信アセット、AI検索縮退の
必須マーカー、13モールRegistry、Yahoo!ランキング状態、AI／通常検索APIの追跡IDを
検査する。さらに定期監視で本番とActionsを確認し、異常時だけ自動改善ポリシーへ移る。

## 公式資料

- https://www.aboutamazon.com/news/retail/alexa-for-shopping-learn-and-be-curious-podcast
- https://developer.yahoo.co.jp/changelog/2026-08-12-jlp2.html
- https://developer.yahoo.co.jp/changelog/2026-08-12-jlp1.html
- https://developer.yahoo.co.jp/webapi/shopping/shopping/v1/highRatingTrendRanking.html
- https://developer.yahoo.co.jp/changelog/2021-07-29-shopping265.html
