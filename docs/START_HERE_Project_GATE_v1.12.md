# Project GATE — START HERE v1.12

## 正本

| 用途 | ファイル |
|---|---|
| GAS安定名 | `dist/Project_GATE_Complete.gs` |
| GAS版管理名 | `dist/Project_GATE_Complete_v1.12.gs` |
| LINE／PWA Worker | `tools/line-worker/` |
| Chrome拡張 | `tools/chrome-extension/` |
| 公開前診断 | `docs/PREFLIGHT_SPEC_v1.10.md` |
| 全テスト | `npm test` |
| リリース生成 | `npm run release` |

## v1.12で修正したこと

- GitHub Actionsの重複を解消し、旧v1.10参照を除去
- バージョン番号をルート`package.json`へ一本化
- GAS結合版に版管理名と安定名を同時生成
- GAS、LINE／PWA、Chrome、リリース設定を`npm test`で一括検証
- プレゼン・生成ZIP・検査ファイルのGitHub誤登録を防止
- リリースZIPとmanifestを現在版から自動生成

## PCで必要な残作業

1. GitHubへv1.12を一意なcommitとして保存
2. GASを`dist/Project_GATE_Complete_v1.12.gs`へ全置換
3. `setupProjectGate()`と「公開前チェック」を実行
4. Cloudflare Secretsを入力してWorkerをデプロイ
5. `/health`が`ok=true`になることを確認
6. LINE、PWA、Chromeを実機試験
7. ITGパイロット契約と承認済み商品コード100件を登録

Secretの実値をGitHub、チャット、スプレッドシートのセルへ保存しない。
