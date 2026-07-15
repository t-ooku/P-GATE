# Project GATE v1.2 リリースノート

## 目的

コアMVP完成後の運用ハードニング。取込がない通常時のログ増大と、GAS実行時間上限・強制終了からの復旧を改善した。

## 変更内容

- 入力ZIPがない5分トリガーでは、System_Logと05_Logへ空振りログを保存しない。
- 1回のGAS実行で処理するZIPを古い順に1件へ制限し、残りは次回トリガーへ繰り越す。
- 30分以上`STARTED`のまま残ったImport_Logを`FAILED`へ自動補正する。
- 補正したログへ`STALE_EXECUTION_RECOVERED`を記録し、同じZIPを次回安全に再処理できるようにした。
- 上記3条件のローカル回帰テストを追加した。

## 互換性

- Configシート、既存データ、Folder IDの変更は不要。
- Apps Scriptの結合版を差し替えるだけで更新できる。
- Windows Bridgeの再インストールは不要。

## バージョン更新

Apps Script差し替え後、Configシートの`SYSTEM_VERSION`を`1.2.0`へ変更する。
