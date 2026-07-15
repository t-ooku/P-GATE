# Project GATE — START HERE v1.7

## 正本

| 用途 | ファイル |
|---|---|
| GAS | `dist/Project_GATE_Complete_v1.7.gs` |
| PWA／公開API／LINE Worker | `tools/line-worker/` |
| PWA仕様 | `docs/PWA_SPEC_v1.7.md` |
| PWA導入 | `docs/PWA_DEPLOYMENT_GUIDE_v1.7.md` |
| 多言語検索 | `docs/MULTILINGUAL_KNOWLEDGE_SPEC_v1.6.md` |
| LINE | `docs/LINE_INTEGRATION_SPEC_v1.6.md` |

## 現在できていること

- 日本語の出品データを正本にした日・英・中・韓・ローマ字検索
- 根拠付き最大3候補、利益非優先、根拠不足時は回答しない
- LINEの署名検証、回答、Amazon送客、KPI
- iPhone／Android／PCへインストールできるPWA
- Turnstile保護、同意、匿名セッション、署名付き送客
- LINEとPWAを顧客契約別・チャネル別に計測

## 未完了

- GAS v1.7の実環境反映
- Apps Script Web App、Cloudflare、Turnstileの外部設定
- LINEとPWAの実機受入試験
- 正式公開用の運営者情報、規約、プライバシー方針
- Chrome拡張の端末認証設計と実装
- App Store／Google Play版

## 次にPCで行う順番

1. v1.7をGitHubへ保存
2. GASの`コード.gs`をv1.7へ全置換
3. `setupProjectGate()`を実行
4. ITGパイロット契約を登録
5. GAS Web Appをデプロイ
6. Cloudflare TurnstileとWorkerを設定
7. PWAをスマホで実機確認
8. LINE Webhookを実機確認

SecretはGitHub、GASソース、スプレッドシートへ保存しない。Script PropertiesとCloudflare Secretsだけを使う。
