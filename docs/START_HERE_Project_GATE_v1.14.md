# Project GATE v1.14 導入開始点

## 今回追加されたもの

- Amazon・楽天市場・Yahoo!ショッピングの購入先管理
- Marketplace別URL許可リストと類似ドメイン拒否
- 顧客の支払総額と配送目安による購入先整列
- LINE/PWAの署名付き複数EC送客
- 公開回答から店舗名・元URL・外部商品IDを除外
- `Marketplace_Offers`を含む公開前診断

## 最短導入順

1. `dist/Project_GATE_Complete_v1.14.gs`をApps Scriptへ反映する。
2. `setupProjectGate()`を実行する。
3. `Marketplace_Offers`へテスト商品の購入先を各EC1件ずつ登録する。
4. 確認済み行の`Approved`を`TRUE`にする。
5. `runProjectGatePreflight()`を実行し、FAILを0件にする。
6. Worker v1.14をデプロイし、`/health`のreleaseが`1.14.0`であることを確認する。
7. LINEまたはPWAから質問し、署名付きURLが正しいECへ遷移することを確認する。

## MVP完成までに人が確認する項目

- 実在する購入先URL、価格、送料、在庫、配送日数
- LINE Developers、Cloudflare、Turnstileの外部設定
- ITGの実商品を使った表示→クリック→送客→購入の一連の計測
- 同一商品に複数ECがある場合の表示内容と顧客理解

詳細仕様は`MULTI_EC_OFFER_SPEC_v1.14.md`、チェック手順は`RELEASE_CHECKLIST_v1.14.md`を参照する。
