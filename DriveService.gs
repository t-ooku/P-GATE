# Power Automate連携手順

目的は、アクセスから出力されたZIPをOneDriveからGoogle Driveの`01_Input_Zip`へコピーすることだけとする。CSV処理はGAS側が担当する。

## フロー

1. Power Automateで`自動化したクラウド フロー`を作成する。
2. OneDrive for Businessの`ファイルが作成されたとき`をトリガーにする。
3. アクセスのZIPが置かれるOneDriveフォルダを指定する。
4. ZIP以外を除外する条件を追加する。
5. OneDrive for Businessの`ファイル コンテンツの取得`を追加する。
6. Google Driveの`ファイルの作成`を追加する。
7. 保存先としてProject GATEの`01_Input_Zip`を選択する。
8. ファイル名はトリガーのファイル名、内容は取得したファイルコンテンツを指定する。
9. フローを保存し、テスト用ZIPを1件OneDriveへ置く。

## 合格条件

- Google Driveの`01_Input_Zip`に同名ZIPが1件作成される。
- ZIPサイズがOneDrive側と一致する。
- 次回のGASトリガー実行で処理され、成功時は`03_Archive`へ移動する。
- 同一操作でZIPが複数作成されない。

## 注意

- Google Drive側でZIPを解凍しない。
- CSVへの変換、文字コード変換、商品抽出をPower Automateへ追加しない。
- Power Automateの役割をファイル転送だけに限定し、処理ロジックの二重管理を避ける。
