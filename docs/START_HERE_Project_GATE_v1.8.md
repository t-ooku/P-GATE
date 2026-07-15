# Project GATE — START HERE v1.8

## 正本

| 用途 | ファイル |
|---|---|
| GAS | `dist/Project_GATE_Complete_v1.8.gs` |
| LINE／PWA／公開API | `tools/line-worker/` |
| Chrome拡張 | `tools/chrome-extension/` |
| iOS／Android設計 | `docs/NATIVE_APP_ARCHITECTURE_v2.0.md` |
| PWA導入 | `docs/PWA_DEPLOYMENT_GUIDE_v1.7.md` |
| Chrome確認 | `docs/CHROME_EXTENSION_TEST_GUIDE_v1.8.md` |

## 完成したコード

- 日本語商品マスターと多言語Knowledge
- 顧客契約、競合同意、独占、KPI
- LINE質問・回答・送客
- iPhone／Android／PC用PWA
- Turnstile保護された公開API
- Manifest V3 Chrome拡張

## 外部設定待ち

- GAS v1.8反映とWeb Appデプロイ
- ITGパイロット契約
- Cloudflare Turnstile／Worker
- LINE Developers
- Chromeへのローカル読込
- PWA／LINE／Chromeの実機試験

## PCでの実施順

1. `Project_GATE_Source_v1.8.zip`を展開してGitHubへ保存
2. GASをv1.8へ全置換して`setupProjectGate()`
3. ITGパイロット契約とScript Properties
4. GAS Web App
5. Turnstile／Cloudflare Worker
6. PWAをスマホ実機で確認
7. LINEを実機で確認
8. Chrome拡張をローカル読込して確認

Chrome Web Store、App Store、Google Playへの一般公開は、パイロットKPIと正式な規約・プライバシー方針を確認してから行う。
