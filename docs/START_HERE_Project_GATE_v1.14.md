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
3. メニュー「複数EC購入先を準備・検証」を実行し、既存Amazon URLの下書きを自動作成する。
4. `Marketplace_Offers`の下書きへ価格・送料・配送日数を補い、楽天・Yahoo!の購入先を追加する。
5. 確認済み行の`Approved`を`TRUE`にする。
6. 再度「複数EC購入先を準備・検証」を実行し、`Marketplace_Offer_Validation`のFAILを0件にする。
7. `runProjectGatePreflight()`を実行し、FAILを0件にする。
8. Worker v1.14をデプロイし、`/health`のreleaseが`1.14.0`であることを確認する。
9. LINEまたはPWAから質問し、署名付きURLが正しいECへ遷移することを確認する。

`Marketplace_Offers`にはMarketplace・通貨・在庫のプルダウン、価格・送料・配送日数の数値制限、Approvedのチェックボックスが自動設定される。各見出しへカーソルを合わせると入力説明を確認できる。

## MVP完成までに人が確認する項目

- 実在する購入先URL、価格、送料、在庫、配送日数
- LINE Developers、Cloudflare、Turnstileの外部設定
- ITGの実商品を使った表示→クリック→送客→購入の一連の計測
- 同一商品に複数ECがある場合の表示内容と顧客理解

詳細仕様は`MULTI_EC_OFFER_SPEC_v1.14.md`、チェック手順は`RELEASE_CHECKLIST_v1.14.md`を参照する。
