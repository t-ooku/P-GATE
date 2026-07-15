# Project GATE v1.11.0 Release Notes

## 目的

実装済みのLINE、PWA、Chromeを安全に本番設定できる状態へ近づけ、公開前の設定不足をURLだけで診断できるようにする。

## 変更

- Cloudflare Workerへ`GET /health`を追加
- GAS URLがHTTPSか、必須5設定があるか、署名鍵が32文字以上かを検査
- LINE Channel SecretとAccess Tokenの片側だけが設定された状態を検出
- ヘルスチェックは設定名と合否だけを返し、Secret値を返さない
- Turnstile Site Key未設定時は`/api/config`が503を返す
- `.dev.vars`をGit対象外にし、安全な`.dev.vars.example`を追加
- GitHub Actions CIと一括リリース生成を追加

## 互換性

ZIP取込、Master Database、Knowledge、KPI、契約、商品識別子のシート仕様に破壊的変更はない。`setupProjectGate()`を再実行すると`SYSTEM_VERSION`が`1.11.0`へ更新される。

## 完成境界

ローカル実装と自動テストは完了。本番公開にはGAS、Cloudflare、Turnstile、LINE Developersでの本人操作と実機試験が必要。
