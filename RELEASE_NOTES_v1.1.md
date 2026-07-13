# Project GATE MVP v1.1 Release Notes

## 変更点

- 個人用Microsoftアカウントの`AADSTS500200`へ対応。
- Power Automateの代替として固定費ゼロのWindows Bridgeを追加。
- OneDrive同期元とGoogle Drive同期先をGUIで設定。
- 5分間隔のバックグラウンド監視とWindowsログイン時の自動起動。
- SHA-256による転送済み判定。
- 一時`.tmp`から`.zip`へ変更する安全な受け渡し。
- Windows PowerShell 5.1向けUTF-8 BOM対応。
- Status / Uninstallコマンドを同梱。

## 実環境結果

- 初回: 100件読込、100件有効、100件登録、SUCCESS。
- 自動連携2回目: 100件読込、100件有効、100件Unchanged、SUCCESS。
- OneDrive → Windows Bridge → Google Drive → GASの一連処理を確認。

## 判定

コアMVP完成。通常運用開始可能。
