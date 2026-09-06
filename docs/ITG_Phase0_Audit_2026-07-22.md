# ITG Phase0 実装監査（2026-07-22）

## 結論

GitHubの `t-ooku/P-GATE` には Project GATE v1.14.0 の最新実装が存在する。`dist/Project_GATE_Complete_v1.14.gs`、複数EC、LINE/PWA、公開前診断、テスト、Windows Bridgeを確認した。

一方、ルート直下には旧 `Project_GATE_Complete_v1.0.gs` も残っている。旧版と最新版の併存が、Apps Scriptへ貼り付けるファイルの取り違えを招いた。導入時は必ず `dist/Project_GATE_Complete_v1.14.gs` を正とする。

## 今回修正した不具合

`setupProjectGate()` の最後で `SpreadsheetApp.getUi().alert()` を呼んでいたため、Apps Scriptエディタから実行した際にスプレッドシート側のダイアログ待ちとなり、最大実行時間を超過することがあった。

修正後は、処理を止めない `Spreadsheet.toast()` と `Logger.log()` で完了を通知する。ソース、v1.14結合版、最新版結合版、回帰テストを同時に更新した。

## 確認済み

- v1.14.0のソースと結合版がGitHubに存在する。
- Config、ZIP解凍、CSV取込、Master Database、Opportunity、Import Log、ロック、5分トリガーが実装されている。
- 複数tenantを `Tenant` で分離するデータ構造がある。
- Marketplace Offers、入力規則、検証、LINE/PWA、署名付き送客、公開前診断が実装されている。
- Windows BridgeはSHA-256による重複防止、書込完了待ち、一時ファイル経由の安全な引渡しを実装している。

## 実環境で確認済み

1. Apps Scriptへv1.14系の個別ソースを反映し、`setupProjectGate()`がタイムアウトせず完了した。
2. Configの必須フォルダ設定を読み込み、`runProjectGate`が正常実行した。
3. `runProjectGate`の5分トリガーを確認した。
4. Archive 30日保持処理のドライランが正常完了し、日次productionトリガーを設定した。
5. Power Automate Desktopが3アカウントで「全件まとめて」を選択し、全件ZIPを順番に取得した。
6. Bridge→Google Drive→GAS→`03_Archive`の経路を3アカウントすべてで完走した。
7. PADはArchive件数増加を検知し、各待機ループを抜けて正常終了した。
8. Windows Task Schedulerを毎日5:00・繰り返しなしで設定した。
9. Marketplace refresh/validation関数がエラーなく完了した（入力データ0件）。

## 引き続き実環境で確認が必要

1. 2026-07-23 5:00の初回定時自動起動と実行結果0x0。
2. 5営業日の連続定時実行とTenant別件数の照合。
3. ZIP未生成、90回タイムアウト、壊れたZIP、重複ZIP、Bridge/GAS遅延の異常系。
4. Marketplace Offersの実データ入力・承認とValidation FAIL 0件。
5. 公開前診断のFAIL 0件。
6. LINE Developers、Cloudflare Worker、Turnstile、PWAの外部設定。
7. 実商品で表示→クリック→送客→購入のKPI計測。

## MYGATE移行方針

Project GATEは開発コードネームおよびITG Phase0の基盤名として維持する。対外サービス、UI、コピー、機能ブランドはMYGATEへ統一する。既存の安定稼働基盤を壊す一括改名は行わず、移行レイヤーを設けて段階的に更新する。

## 完了判定

- コード監査とタイムアウト修正: 完了
- GitHub上のSSoT整備: 完了
- CI: Project GATE CI #50 成功
- Google Apps Script / Drive / Spreadsheet: Phase0正常系を実環境確認済み
- Power Automate Desktop: 3アカウント連続完走を実機確認済み
- Task Scheduler: 毎日5:00設定済み、初回定時実行待ち
- 外部公開設定: 管理者作業待ち


