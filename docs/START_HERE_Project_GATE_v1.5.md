# Project GATE — START HERE v1.5

## 現在の正本

| 用途 | 正本 |
|---|---|
| GAS本体 | `dist/Project_GATE_Complete_v1.5.gs` |
| GAS manifest | `gas/appsscript.json` |
| Windows Bridge本体 | `Project_GATE_Bridge.ps1` |
| Windows Bridge配布物 | `tools/windows-bridge/` |
| 完成証跡 | `docs/MVP_COMPLETION_REPORT_2026-07-14.md` |

2026-07-14の旧Webアップロードで名前と中身が入れ替わったルート直下の個別`.gs`ファイルは使用しない。GASは`dist/`の結合版だけをApps Scriptの`コード.gs`へ貼り付ける。

v1.2の運用ハードニング、v1.3のKPI計測、v1.4の契約ポリシーに加え、v1.5では根拠付きKnowledge回答基盤を追加した。

## KPI計測

- `KPI_Event_Log`: 表示、クリック、送客、購入を記録
- `KPI_Summary`: 顧客・キャンペーン・実験群別の日次実績
- `KPI_Uplift`: 従来表示とP-GATE表示の差、売上・粗利改善を比較

計測仕様は`docs/MEASUREMENT_SPEC_v1.3.md`を正本とする。v1.3時点では外部Web画面と購入成果APIは未接続。

## 契約ポリシー

- `Client_Contracts`: 契約期間、対象カテゴリ、競合グループ、独占、同意を管理
- `Recommendation_Decisions`: 推薦の許可／拒否と理由を監査
- 同じ回答を競合へ配る場合は双方同意と顧客開示が必須
- 回答独占・カテゴリ独占契約は競合推薦を自動拒否

詳細は`docs/CONTRACT_POLICY_SPEC_v1.4.md`を正本とする。

## Knowledge回答

- 日本語質問と同じtenantの商品を照合
- 関連性と確認可能な商品情報から最大3候補を返す
- 利益や契約料金は順位に使用しない
- 根拠不足時は回答を生成しない
- 質問本文は保存せずHashだけを監査記録

詳細は`docs/KNOWLEDGE_SPEC_v1.5.md`を正本とする。

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
