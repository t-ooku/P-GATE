# HOSHILU 日英メディア事実シート（未送信）

状態: `READY_FOR_OWNER_REVIEW`  
用途: 記者、編集者、ニュースレター、提携候補が事実確認できる素材。外部送信・公開・連絡先利用は未実行。

## 一文説明 / One-line description

**JA**  
HOSHILU（ホシル）は、商品名が分からなくても、色・形・用途・見た場所などの特徴から商品検索を始められるWeb/PWAサービスです。

**EN**  
HOSHILU is a web and PWA product-discovery service that lets people start a search from remembered details such as color, shape, purpose, or where they saw an item—even when they do not know its name.

## 確認済み事実 / Verified facts

- サービス名 / Name: HOSHILU（ホシル）
- 本番URL / Live URL: https://hoshilu.app/
- 提供形態 / Format: Web / installable PWA
- ゲスト利用 / Guest access: 商品検索は登録なしで開始可能。保存・会員機能は別導線。
- 入力言語 / Interface languages: 日本語、英語、中国語、韓国語。
- 検索方法 / Search input: 商品名または、色・形・用途・大きさ・素材・見た場所などの説明。
- 購入先 / Destinations: 確認済みの商品ページがある場合はそのページへ、ない場合は対応モールの検索結果へ案内する。
- 価格・在庫 / Price and availability: HOSHILUは最新性を保証しない。購入前にリンク先モールで確認が必要。
- 会員 / Membership: 無料会員導線あり。MYWISHへ検索を保存して後から再検索できる。
- 計測 / Measurement: 匿名の許可済みイベントだけを保存し、`traffic_class='QA'` を成果から分離する。

## What HOSHILU does not claim

- It does not claim perfect search accuracy, the lowest price, guaranteed availability, or guaranteed delivery.
- It does not present unverified user counts, sales results, rankings, or “No. 1” claims.
- Marketplace prices, stock, safety information, import restrictions, and delivery terms must be confirmed on the destination page.
- Users should not enter names, addresses, contact details, or other personal information into product descriptions.

## 記事向け短文 / Short media copy

**JA（約120字）**  
HOSHILUは、名前を思い出せない商品でも、色・形・用途などの特徴から探し始められるWeb/PWAサービスです。登録なしで検索を試し、複数モールの購入候補や検索結果を確認できます。価格・在庫は各モールでの確認が必要です。

**EN**  
HOSHILU helps people search for products they can describe but cannot name. Visitors can try the search without registering and review available product destinations or marketplace search results. Current prices, availability, and delivery terms must be confirmed on each marketplace.

## 取材で確認してほしいポイント / Suggested review points

1. 商品名なしで、曖昧な説明から検索を始められるか。
2. 日英の同一テーマSEOページと、言語切替が正しく動くか。
3. ゲスト検索から無料会員、MYWISH、モール送客までの導線が理解できるか。
4. 未確認の商品・価格・在庫を断定していないか。
5. 改善してほしい説明入力、検索結果、モバイル表示は何か。

## 素材 / Owned assets

- 正方形ロゴ / Square logo: `tools/line-worker/public/icons/hoshilu-v2-512.png`
- 横長画像 / Landscape image: `tools/line-worker/public/og-hoshilu.png`（1200×630）
- 英語デモ / English demo: https://hoshilu.app/en/find-product-without-name
- 日本語デモ / Japanese demo: https://hoshilu.app/ja/find-product-without-name
- プライバシー / Privacy: https://hoshilu.app/privacy.html
- 利用規約 / Terms: https://hoshilu.app/terms.html

画像はHOSHILU保有素材だけを使用し、媒体によるトリミング・再配布条件は本人が許諾前に確認する。

## 媒体別計測URL / Publication-specific measurement

媒体名を小文字英数字とアンダースコアへ正規化し、本人確認後に置換する。

`https://hoshilu.app/en/find-product-without-name?utm_source=[media_name]&utm_medium=earned_media&utm_campaign=media_outreach_202608&utm_content=editorial_link`

- 分離指標: LP到達、検索開始、検索完了、無料登録完了、再訪、モール送客。
- `traffic_class='QA'` は実績へ混ぜない。
- 媒体クリックとHOSHILU内イベントを個人単位で推定接続しない。

## 送信前の本人確認

- [ ] 媒体と担当者が実在し、掲載方針がHOSHILUに適合する。
- [ ] 掲載料、契約、成果報酬が0円である。費用・契約があれば中断する。
- [ ] 本人が使用許諾する画像と範囲を選ぶ。
- [ ] 連絡先は本人が承認したものだけを記入する。認証情報や個人情報を本文へ入れない。
- [ ] 広告・提供・アフィリエイト関係がある場合は媒体と読者へ明示する。
- [ ] 外部送信・公開は本人の承認後に本人操作で行う。
