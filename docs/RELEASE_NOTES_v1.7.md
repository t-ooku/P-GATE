# Project GATE v1.7.0 Release Notes

## 追加

- iPhone／Android／PC対応のインストール可能なPWA
- 日本語・英語・中国語・韓国語の画面
- ローマ字を含む多言語Knowledge公開API
- Cloudflare Turnstileのサーバー側検証
- 匿名セッション、同意、質問長、本文サイズ、同一オリジン検証
- PWA用の署名付きAmazon送客とKPI計測
- Manifest、Service Worker、192px／512pxアイコン
- Content Security Policyとパイロット用プライバシー方針

## データ保護

- 日本語商品マスターは引き続き正本。
- 公開回答から内部SKU、正確な在庫数、元URL、内部ハッシュ、取込日時を除外。
- PWA質問本文を永続ログへ保存しない。
- 商品回答とAPIレスポンスをService Workerへ保存しない。

## 状態

コードとローカルテストは完成。Cloudflare、Turnstile、GAS Web Appの外部設定と実機受入試験は未実施。
