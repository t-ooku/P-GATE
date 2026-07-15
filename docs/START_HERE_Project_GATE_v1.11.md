# Project GATE — START HERE v1.11

## 正本

| 用途 | ファイル |
|---|---|
| GAS | `dist/Project_GATE_Complete_v1.11.gs` |
| 公開前診断 | `docs/PREFLIGHT_SPEC_v1.10.md` |
| LINE／PWA Worker | `tools/line-worker/` |
| Worker設定診断 | `GET /health` |
| Chrome拡張 | `tools/chrome-extension/` |
| リリース一括生成 | `node tools/release.js` |

## v1.11で追加したこと

- Workerの必須設定、HTTPS URL、32文字以上の署名鍵、LINE片側設定を公開前に検出
- Secret値を返さない`/health`エンドポイント
- Turnstile未設定時に`/api/config`が503を返す公開防止
- GAS、LINE／PWA、ChromeのGitHub Actions自動テスト
- GAS結合版、Source ZIP、Worker ZIP、Chrome ZIP、SHA-256 manifestの一括生成

## 次にPCで行うこと

1. `Project_GATE_Source_v1.11.zip`を展開してGitHubへ保存
2. GASを`Project_GATE_Complete_v1.11.gs`へ全置換
3. `setupProjectGate()`と「公開前チェック」を実行
4. CloudflareのSecretsを入力してWorkerをデプロイ
5. `/health`が`ok=true`になることを確認
6. LINE、PWA、Chromeを実機試験
7. ITGパイロット契約と承認済み商品コード100件を登録

Secretの実値をGitHub、チャット、スプレッドシートのセルへ保存しない。
