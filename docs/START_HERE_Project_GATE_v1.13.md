# Project GATE — START HERE v1.13

## 正本

| 用途 | ファイル |
|---|---|
| GAS安定名 | `dist/Project_GATE_Complete.gs` |
| GAS版管理名 | `dist/Project_GATE_Complete_v1.13.gs` |
| 匿名比較仕様 | `docs/ANONYMOUS_BENCHMARK_SPEC_v1.13.md` |
| LINE／PWA Worker | `tools/line-worker/` |
| Chrome拡張 | `tools/chrome-extension/` |
| 全テスト | `npm test` |
| リリース生成 | `npm run release` |

## v1.13で追加したこと

- 同意済み契約だけを使う匿名ベンチマーク
- 5社未満の小集団を自動抑止
- 個社識別子を出力しない中央値・P25・P75
- 同意の矛盾があるアカウントを自動除外
- 公開前チェックへ同意社数を追加
- リリース検査に残っていた版番号固定を解消

## PCで必要な残作業

1. GASを`dist/Project_GATE_Complete_v1.13.gs`へ全置換
2. `setupProjectGate()`と「公開前チェック」を実行
3. Cloudflare Secretsを入力してWorkerをデプロイ
4. `/health`が`ok=true`になることを確認
5. LINE、PWA、Chromeを実機試験
6. ITGパイロット契約と承認済み商品コード100件を登録

Secretの実値をGitHub、チャット、スプレッドシートのセルへ保存しない。
