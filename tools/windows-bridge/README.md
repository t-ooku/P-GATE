# Project GATE Windows Bridge

個人用MicrosoftアカウントではPower Automateクラウドフローを利用できない場合があるため、Windows上のOneDrive同期フォルダからGoogle Drive同期フォルダへZIPを転送する固定費ゼロの代替です。

## 前提

- Windows 10 / 11
- OneDriveデスクトップアプリが同期済み
- Google Drive for desktopが同期済み
- PCへログイン中であること

## インストール

1. ZIPを展開する。
2. `Install_Project_GATE_Bridge.cmd`をダブルクリックする。
3. 1つ目の画面でAmazon出品システムのZIP出力先となるOneDriveフォルダを選ぶ。
4. 2つ目の画面でGoogle Driveの`Project GATE\01_Input_Zip`を選ぶ。
5. 「インストールが完了しました」が表示されたら完了。

以後、PCへのログイン中は5分ごとに同期元の新しい`.zip`を確認する。Windowsへの次回ログイン時も自動起動する。

## 動作

- 書込完了から30秒以上経過したZIPだけを転送する。
- 初回設定より前から同期元に存在するZIPは転送対象外として記録する。
- 一度転送した内容はSHA-256で記録し、Google Drive側でArchiveへ移動された後も再転送しない。
- 同名で内容が異なるZIPは日時サフィックスを付けて転送する。
- 一時ファイルは`.tmp`で保存し、コピー完了後だけ`.zip`へ変更する。
- MicrosoftやGoogleのパスワード・トークンは保存しない。

## 確認

`Status_Project_GATE_Bridge.cmd`をダブルクリックすると、実行状態・同期元・同期先・ログ保存先を確認できる。

## アンインストール

`Uninstall_Project_GATE_Bridge.cmd`をダブルクリックする。自動起動とバックグラウンド監視を停止する。設定とログは`%LOCALAPPDATA%\ProjectGATEBridge`に残る。

## 制約

- PCが停止・スリープ・サインアウト中は転送しない。
- OneDriveとGoogle Drive for desktopが正常に同期している必要がある。
- 将来、Microsoft 365の職場・学校アカウントが用意できた場合はPower Automateクラウドフローへ置き換えられる。
