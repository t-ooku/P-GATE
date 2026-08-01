# HOSHILU レスポンシブディスプレイ広告素材表（未入稿）

## 利用条件

- 初期状態は未入稿・未配信。
- リターゲティングは同意管理、プライバシーポリシー、保存期間、媒体設定を本人が承認するまでOFF。
- 検索文、メールアドレス、会員ID、商品カテゴリからオーディエンスを作らない。
- 無断の商品画像・販売店ロゴ・レビューを使用しない。

## 画像候補

リポジトリ内のHOSHILU制作物のみを候補にする。入稿前に権利台帳とトリミング表示を本人確認する。

- 横長 1.91:1: `tools/line-worker/public/hoshilu-discovery-collage.webp`
- 正方形: `tools/line-worker/public/og-hoshilu.png`
- ロゴ正方形: `docs/brand/HOSHILU_official_mark.png`

Google公式の推奨例は横長1200×628、正方形1200×1200、横長ロゴ1200×300、正方形ロゴ1200×1200。画像の引き伸ばしはせず、必要な派生は元データから書き出す。

## テキスト素材

短い見出し（30文字以内）:

1. 商品名なしでも探せる
2. 覚えている特徴から商品検索
3. 色や形から欲しいを探す
4. 複数モールを横断検索
5. HOSHILUで無料検索

長い見出し（90文字以内）:

商品名が分からなくても、色・形・用途など覚えている特徴から商品を探せます

説明（90文字以内）:

1. 検索は登録不要。覚えていることを入力して購入先候補を確認できます。
2. 通常4モール、ファッションは最大9モールを横断して探せます。
3. 出品確認済みなら商品ページへ。未確認の場合はモール検索へ案内します。
4. 価格や在庫などの最新情報は案内先の販売ページで確認できます。

事業者名: HOSHILU

最終URL:

`https://hoshilu.app/ja/find-product-without-name?utm_source=google&utm_medium=display&utm_campaign=acq_unknown_product_display_202608&utm_content=rda_a`

## 初期テスト案

- 期間7日、日予算上限1,000円、総額上限7,000円
- 検索広告とはキャンペーン・予算を分離
- コンテキスト候補はショッピング方法、商品検索、生活の工夫。健康、金融、宗教、人種、未成年などセンシティブ属性を使わない
- 一次指標は非QA `search_completed`、補助指標は`registration_completed`と`marketplace_click`
- 100クリック未満では勝敗を断定しない

公式仕様: https://support.google.com/google-ads/answer/17090561
