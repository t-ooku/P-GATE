# Project GATE MVP — START HERE v1.1

## 現在の正本

| 用途 | 正本 |
|---|---|
| GAS本体 | `Project_GATE_Complete_v1.0.gs` |
| GAS manifest | `Project_GATE_appsscript_v1.0.json` |
| Windows Bridge本体 | `Project_GATE_Bridge.ps1` |
| Windows Bridge配布物 | `Project_GATE_Windows_Bridge_v1.1.zip` |
| 完成証跡 | `Project_GATE_MVP_COMPLETION_REPORT_2026-07-14.md` |

2026-07-14の旧Webアップロードで名前と中身が入れ替わった個別`.gs`ファイルは使用しない。GASは結合版だけをApps Scriptの`コード.gs`へ貼り付ける。

## 日常運用

1. Amazon出品システムのZIPをOneDriveの`Project_GATE_Outgoing`へ保存する。
2. Windowsへログインし、OneDriveとGoogle Drive for desktopを起動しておく。
3. Windows Bridgeが5分ごとにGoogle Driveの`01_Input_Zip`へ新規ZIPを転送する。
4. GASが5分ごとに取込を実行する。
5. スプレッドシートの`Import_Log`で最新Statusを確認する。

## 正常時

- `Status=SUCCESS`
- ZIPはGoogle Driveの`03_Archive`へ移動
- CSVは`02_Extracted_CSV`へ保存
- Master_DatabaseはHash差分だけ更新
- Opportunityは直近正常バッチの最大100件
- System_Logと`05_Log`に監査ログを保存

## 異常時

- `Status=FAILED`
- `Error_Code`と`Error_Message`を確認
- ZIPは`04_Error`へ移動
- 原因修正後、内容が異なるZIPをOneDriveへ再配置

## Windows Bridge確認

配布ZIPを展開し、PowerShellで次を実行する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Project_GATE_Bridge.ps1" -Mode Status
```

`状態: 実行中`、同期元がOneDrive、同期先がGoogle Driveの`01_Input_Zip`なら正常。

## 制約

個人用MicrosoftアカウントではPower Automateを利用できなかったため、MVP v1.1はWindows Bridgeを採用する。PC停止・スリープ・サインアウト中はOneDriveからGoogle Driveへの転送を行わない。
