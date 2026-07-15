# P-GATE 複数EC購入先仕様 v1.14

## 目的

日本語の商品マスターを正本としたまま、エンドユーザーへAmazon、楽天市場、Yahoo!ショッピングの購入先を安全に提示する。商品推薦の中立性と、送客効果の計測を両立する。

## 対応Marketplace

| Marketplace値 | 許可ドメイン | 表示名 |
|---|---|---|
| `AMAZON_JP` | `amazon.co.jp`配下 | Amazon |
| `RAKUTEN_JP` | `rakuten.co.jp`配下 | 楽天市場 |
| `YAHOO_JP` | `shopping.yahoo.co.jp`、`store.shopping.yahoo.co.jp`配下 | Yahoo!ショッピング |

HTTPS以外、認証情報を含むURL、類似ドメインは拒否する。

## Marketplace_Offersシート

| 列 | 必須 | 入力規則 |
|---|---:|---|
| Offer_ID | ○ | テナント内で識別できる値 |
| Tenant | ○ | 商品マスターと同じtenant |
| ASIN | ○ | 英数字10文字 |
| Marketplace | ○ | 上表のいずれか |
| External_Product_ID |  | EC側の商品ID。公開回答には出さない |
| Product_URL | ○ | Marketplaceと一致するHTTPS URL |
| Price | ○ | 0より大きい数値 |
| Shipping_Fee | ○ | 0以上 |
| Currency | ○ | 原則`JPY` |
| Stock_Status | ○ | `IN_STOCK` / `OUT_OF_STOCK` / `UNKNOWN` |
| Delivery_Days |  | 0以上。未確認は0 |
| Seller_Name |  | 内部管理用。公開回答には出さない |
| Approved | ○ | 承認した行だけ`TRUE` |
| Updated_At |  | 最終確認日時 |

## 選択ルール

商品自体の順位は質問との関連性と確認可能な情報で決める。価格やセラー利益で商品順位は変えない。

同一商品の購入先は次の順で最大3件に絞る。

1. `OUT_OF_STOCK`以外を優先
2. `Price + Shipping_Fee`が低い順
3. `Delivery_Days`が短い順
4. Marketplace、Offer_IDの順で結果を安定化

セラー利益、広告単価、契約単価は選択ロジックへ入れない。

## 公開情報と非公開情報

公開可能: Marketplace、価格、送料、合計、通貨、在庫状態、配送目安、P-GATE署名付き送客URL。PWAでは最大3購入先を個別に選択できる。

非公開: 元URL、Seller_Name、External_Product_ID、内部SKU、取込ハッシュ。元URLは署名付きP-GATE送客URLの内部だけで使用する。

## 運用

1. `setupProjectGate()`で`Marketplace_Offers`を作成する。
2. メニュー「複数EC購入先を準備・検証」で、Master Databaseの既存Amazon URLを未承認下書きへ変換する。同じTenant・ASIN・Marketplaceは重複作成しない。
3. 購入先を入力し、担当者がURL・価格・在庫を確認する。
4. 確認済み行だけ`Approved=TRUE`にする。
5. 同メニューを再実行し、`Marketplace_Offer_Validation`の承認済みエラーを0件にする。
6. `runProjectGatePreflight()`で承認済み購入先件数を確認する。
7. LINE/PWA実機試験で送客とKPI記録を確認する。

価格・在庫を自動取得する外部API連携はMVP後の追加範囲とし、v1.14では承認済みデータだけを使う。
