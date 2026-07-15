# Project GATE v1.6.0 Release Notes

## 追加

- 日本語の商品マスターを正本とする多言語Knowledge検索
- 英語・中国語・韓国語・ローマ字の承認済み検索別名
- 言語別の承認済み表示名・説明と日本語フォールバック
- 商品ごとの多言語SEO整備スコア
- LINE公式アカウント向けWebhook / Knowledge回答 / KPI連携
- LINE署名検証を行うCloudflare Worker
- 署名付きAmazon送客リンク、期限、ドメイン制限
- LINE再送とKPIイベントの重複排除

## セキュリティ

- LINE Channel Secret / Access TokenはGASへ置かない。
- 生のLINEユーザーIDと質問文をログへ保存しない。
- 直接LINE→GAS接続は禁止し、署名検証済みWorkerだけを受け付ける。

## 互換性

既存の日本語商品マスターは変更しない。多言語シートとLINEイベントシートは`setupProjectGate()`で追加される。LINEを設定しない限り、既存のZIP取込・KPI・Knowledge処理へ影響しない。
