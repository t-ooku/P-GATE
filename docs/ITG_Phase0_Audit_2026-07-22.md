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

## 実環境で確認が必要

次はコードだけでは完了判定できない。担当者が各管理画面で確認する。

1. Apps Scriptに `dist/Project_GATE_Complete_v1.14.gs` が反映されている。
2. `setupProjectGate()` がタイムアウトせず完了する。
3. Configの5フォルダIDとSpreadsheet IDが実環境に一致する。
4. 3アカウントのZIPを順番に取り込み、Tenantが混在しない。
5. Power Automate Desktopが3アカウントで「全件まとめて」を選び、完成済みZIPだけをGoogle Driveへ渡す。
6. Marketplace_Offer_Validationと公開前診断のFAILが0件になる。
7. LINE Developers、Cloudflare Worker、Turnstile、PWAの外部設定を完了する。
8. 実商品で表示→クリック→送客→購入のKPIを計測する。

## MYGATE移行方針

Project GATEは開発コードネームおよびITG Phase0の基盤名として維持する。対外サービス、UI、コピー、機能ブランドはMYGATEへ統一する。既存の安定稼働基盤を壊す一括改名は行わず、移行レイヤーを設けて段階的に更新する。

## 完了判定

- コード監査とタイムアウト修正: 完了
- GitHub上のSSoT整備: 完了
- CI: Pull Request上で確認
- Google Apps Script / Drive / Spreadsheet: 実環境確認待ち
- Power Automate Desktop: 実機確認待ち
- 外部公開設定: 管理者作業待ち


