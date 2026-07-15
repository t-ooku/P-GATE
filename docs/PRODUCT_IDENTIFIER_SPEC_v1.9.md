# 商品識別子仕様 v1.9

## 目的

日本語商品マスターのASINへJAN・EAN・UPCを承認制で結び付け、将来のiOS／Androidバーコード検索で誤った商品を推薦しない基盤を作る。

## 原則

- 日本語の`Master_Database`とASINを正本として維持する。
- 商品コードから別の商品レコードを生成しない。
- `Approved=TRUE`の識別子だけを検索対象にする。
- チェックディジットが不正なコードは承認済みでも読み込まない。
- 同一tenant・同一コードが複数ASINを指す場合は`AMBIGUOUS`として回答しない。
- tenantをまたぐ同じ商品コードは、それぞれの顧客商品へ独立して結び付ける。

## シート

### Product_Identifiers

| 列 | 内容 |
|---|---|
| Tenant | 商品を所有するtenant |
| ASIN | 日本語商品マスターのASIN |
| Identifier_Type | `JAN` / `EAN` / `UPC` |
| Identifier_Value | 商品コード |
| Source | メーカー資料等の確認元 |
| Approved | 人が確認済みの場合だけ`TRUE` |
| Updated_At | 確認日時 |

### Identifier_Coverage

商品ごとの承認済みコード数と種別を表示する。未整備商品は`Missing_Action`へ対応内容を表示する。

### Identifier_Conflicts

同じtenant・商品コードが複数ASINを指す割当を`BLOCKED`として表示する。競合が1件でもあるコードは検索に使用しない。

## 検証

- JAN: 45または49で始まる13桁、GTINチェックディジット
- UPC: 12桁、GTINチェックディジット
- EAN: 8、13、14桁、GTINチェックディジット
- 空白とハイフンは入力時に除去
- その他の文字、未対応桁数、不正チェックディジットを拒否

## 運用

1. メーカー資料、商品パッケージ、信頼できる商品登録情報でコードを確認する。
2. `Product_Identifiers`へtenant、ASIN、種別、コード、Sourceを入力する。
3. 別担当者または再確認後に`Approved=TRUE`とする。
4. スプレッドシートの「Project GATE → 商品コード整備状況を更新」を実行する。
5. `Identifier_Conflicts`が0件であることを確認する。
6. `Identifier_Coverage`で未整備商品を確認する。

## バーコード検索公開条件

- 対象商品の識別子を最低100件確認
- Conflict 0件
- 実物パッケージ10件以上で読み取りテスト
- 容量・セット数・国仕様違いを区別
- 不一致時は商品を返さず、利用者へ再確認を求める

v1.9は識別子の登録・検証・整備状況まで。PWA／ネイティブカメラからの公開検索は、商品コードデータの受入試験後に有効化する。
