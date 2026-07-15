# Project GATE v1.9.0 Release Notes

## 追加

- `Product_Identifiers`によるJAN／EAN／UPCとASINの承認制紐付け
- GTINチェックディジット検証
- JAN／EAN／UPC別の桁数・形式検証
- tenant別の商品コード検索
- 同一コードの複数ASIN割当を`AMBIGUOUS`として停止
- `Identifier_Coverage`による未整備商品の可視化
- `Identifier_Conflicts`による危険な割当の可視化
- スプレッドシートメニュー「商品コード整備状況を更新」

## 状態

商品コード基盤は実装済み。コードデータの登録と現物受入試験前のため、PWA／iOS／Androidのカメラ検索はまだ公開しない。
