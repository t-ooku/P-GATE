# Project GATE v1.12 リリースノート

## 概要

v1.12は新機能追加ではなく、GitHub保存と公開作業を安全に再現するためのリリース基盤修正版です。

## 修正内容

- 2本存在したGitHub Actionsを`ci.yml`へ統合
- 旧`v1.10`を検証していた設定を削除
- ルート`package.json`をバージョン番号の唯一の正とした
- `dist/Project_GATE_Complete.gs`を安定した配布名として追加
- `npm test`でGAS、LINE／PWA、Chrome、リリース設定を一括確認
- `npm run release`で現在版のZIPとSHA-256 manifestを生成

## 影響

GAS、LINE、PWA、Chrome拡張の業務ロジック変更はありません。v1.11の機能を維持したまま、保存・ビルド・配布時の版ずれを防止します。
