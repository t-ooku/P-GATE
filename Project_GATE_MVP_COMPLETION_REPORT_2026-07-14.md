# Project GATE MVP 完成報告

判定日: 2026-07-14 JST  
判定: **コアMVP完成・通常運用開始可能**

## 完成した実行経路

```text
Amazon出品システム
  → OneDrive Personal / Project_GATE_Outgoing
  → Project GATE Windows Bridge（5分監視）
  → Google Drive / 01_Input_Zip
  → Google Apps Script（5分トリガー）
  → ZIP解凍・CP932 CSV読込
  → Mapping / Normalize / Validation
  → Master_Database差分更新
  → Opportunity / AI_Cache
  → Archive / Error / Log
```

## 実環境で確認した結果

| 試験 | 結果 | 証跡 |
|---|---|---|
| 初回正常取込 | PASS | `Status=SUCCESS`、`Read_Rows=100`、`Valid_Rows=100`、`Inserted=100` |
| 自動転送・自動実行 | PASS | OneDrive投入後、Windows BridgeとGASトリガー経由で2回目のImport_Logを作成 |
| 冪等性 | PASS | 2回目は`Inserted=0`、`Updated=0`、`Unchanged=100` |
| CP932実データ | PASS | 日本語を含む23列、100件がValidation通過 |
| Opportunity | PASS | 正常バッチ完了前に100件を再計算し、成功時のみImport_Logを確定 |
| GAS自動監視 | PASS | `runProjectGate`の時間ベーストリガー1件を確認 |
| Windows Bridge | PASS | Status画面で`実行中`を確認し、Google Driveへの転送に成功 |
| GitHub GAS正本 | PASS | commit `15cd345`の結合版・manifest・START_HEREをローカル正本と照合 |

## ローカル自動テスト

次をすべて合格済み。

- tenant抽出: `itg` / `itt` / `mc2`
- CSV引用符・改行判定
- 実CSV 23列Mapping
- Normalize / Validation
- ASIN異常検知
- SHA-256 Hash安定性・差分検知
- Profit / SEOスコア
- Master連続行一括更新
- `appendRow()`不使用
- Opportunity対象を直近正常バッチ最大100件へ限定
- Windows BridgeのZIP限定、SHA-256冪等性、一時拡張子、5分監視、認証情報非保持

## Power Automateからの変更

Microsoftサインインで`AADSTS500200`が発生し、現在のアカウントが個人用Microsoftアカウントであることを確認した。個人用アカウントでは対象Power Automateアプリを利用できないため、固定費ゼロを維持してWindows Bridgeへ置き換えた。

Windows BridgeはMicrosoftまたはGoogleのパスワード・トークンを保存せず、各デスクトップ同期フォルダ間だけを転送する。

## 運用条件

- Windowsへログイン中であること。
- OneDriveとGoogle Drive for desktopが起動・同期中であること。
- OneDriveの`Project_GATE_Outgoing`へZIPのまま配置すること。
- Google Driveの`01_Input_Zip`へ人手で同じZIPを重ねて配置しないこと。
- `Import_Log`の最新Statusを日次確認すること。

## 完成後の追加試験

通常運用を妨げないハードニング項目として、次を残す。

1. `itg` / `mc2`の実環境ZIP確認（tenant抽出は自動テスト済み）。
2. 1商品の業務値だけを変更した差分更新試験。
3. CSVなし・破損ZIPの`04_Error`隔離試験。
4. GitHub旧アップロード由来の誤配列ファイル整理。
5. 将来、Microsoft 365組織アカウントを利用する場合のPower Automate再採用。

これらはコアMVPの通常運用開始を妨げない。
