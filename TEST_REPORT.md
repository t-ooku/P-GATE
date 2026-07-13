# GitHub保存手順

保存先は`t-ooku/P-GATE`の`main`ブランチ。

## アップロード

1. `Project_GATE_MVP_Source_v1.0.zip`をダウンロードする。
2. WindowsでZIPを右クリックし、`すべて展開`を押す。
3. 展開後のフォルダを開く。
4. <https://github.com/t-ooku/P-GATE/upload/main>を開く。
5. 次の項目をまとめてアップロード欄へドラッグする。
   - `.github`
   - `dist`
   - `docs`
   - `gas`
   - `tests`
   - `tools`
   - `.gitignore`
   - `README.md`
6. Commit messageへ`feat: implement Project GATE MVP pipeline`と入力する。
7. `Commit changes`を押す。

## 完了の見分け方

P-GATEの最初の画面に`gas`、`dist`、`docs`、`tests`、`tools`、`.github`が表示される。`Actions`タブの`validate`が緑色になればローカルと同じ自動テストが成功している。

## ZIP自体は保存しない

GitHubへ保存するのは展開後のファイルとフォルダ。ZIPだけをアップロードしてもGASのソース管理にはならない。
