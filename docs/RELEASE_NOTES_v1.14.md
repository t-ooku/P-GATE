# Project GATE v1.14 Release Notes

## 概要

P-GATEの購入先をAmazon限定から、Amazon・楽天市場・Yahoo!ショッピングへ拡張した。日本語商品マスター、多言語Knowledge、LINE/PWAの既存構造は維持している。

## 追加

- `MarketplaceEngine.gs`
- `Marketplace_Offers`シート
- Marketplace別HTTPSドメイン検証
- 承認済み購入先のtenant分離
- 在庫、顧客支払総額、配送日数による購入先整列
- LINE/PWAの複数EC送客
- PWA商品カードのMarketplace・合計・送料・配送目安表示
- PWAで最大3購入先を比較し、購入先別の署名付きURLから送客
- 公開回答用購入先サニタイズ
- 複数ECの自動テストと公開前診断

## 中立性

商品ランキングは質問との関連性・情報充足・在庫で決まり、セラー利益を使用しない。価格は同一商品の購入先選択だけに使用する。

## 未実装

- 各EC APIからの価格・在庫自動更新
- 楽天・Yahoo!側の購入完了データ連携
- ネイティブiOS/Androidアプリ
- 本番LINE、Cloudflare、ITG実商品での外部受入試験
