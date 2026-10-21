# MYGATE Social Launch Kit

## 正式運用ファイル

- `MYGATE_SOCIAL_OPERATING_SYSTEM_v1.0.md`: 公式SNSの目的、投稿比率、KPI、禁止事項
- `MYGATE_30_DAY_LAUNCH_QUEUE.csv`: 商品画像なしで開始できる30日分の投稿キュー
- `MYGATE_FIRST_10_POST_SCRIPTS_v1.0.md`: 初回10投稿の短尺台本
- `SELLER_SOCIAL_SUPPORT_PLANS_v1.0.md`: 素材パックがない商品のセラー投稿支援
- `MYGATE_PARTNER_CHANNEL_MODEL_v1.0.md`: 公式、セラー既存アカウント、テーマ型共同チャンネルの3層運用
- `ITG_3_STORE_PARTNER_LAUNCH_v1.0.md`: ITG 3店舗のPartner運用、プロフィール、KPI
- `MYGATE_AND_ITG_SOCIAL_START_STATUS.md`: MYGATE公式SNS、LINE、PWAの開始状況
- `HOSHILU_14_DAY_EXECUTION_QUEUE.csv`: HOSHILU再始動用14日投稿キュー
- `HOSHILU_PUBLISHING_CHECKLIST.md`: 権利・同意・計測・公開前の二者確認
- `../../docs/SOCIAL_KNOWLEDGE_SPEC_v1.0.md`: コメント・アンケートを匿名需要集計へ変換する仕様
- `../rights/MYGATE_POSTING_ASSET_PACK_SPEC_v1.0.md`: 例外的に公式商品投稿を行う場合の素材・権利仕様

## 運用原則

MYGATE公式はブランド・参加型コンテンツを中心に運用する。商品画像・動画は、素材パックが `APPROVED` の商品だけに限定する。素材パックがない商品はセラー自身のSNSで宣伝し、MYGATEは契約プランに応じて支援する。

## 現在の開始状態

- コンテンツ戦略: READY
- 30日投稿キュー: READY
- 初回10投稿台本: READY
- 権利運用: READY
- MYGATE公式SNSアカウント: USER ACTION REQUIRED
- 予約投稿ツール接続: USER ACTION REQUIRED
- 初回投稿公開: BLOCKED UNTIL ACCOUNT ACCESS

## HOSHILU再始動時の実行

`node tools/generate-hoshilu-campaign-links.mjs` で14投稿すべての投稿テーマ付き
計測URLを生成する。公開はアカウント所有者の承認後に行い、コメント・ハッシュタグは
告知済み投稿のみ匿名化・人手審査後に集計する。
