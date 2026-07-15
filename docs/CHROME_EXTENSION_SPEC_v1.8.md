# P-GATE Chrome拡張仕様 v1.8

## 目的

利用者がAmazon、楽天、Yahoo!ショッピング等の商品ページを閲覧している高関心の瞬間に、P-GATEへ相談できる入口を提供する。初版はChrome内で直接推薦を返さず、利用者が確認・同意した文字だけをPWAへ安全に引き渡す。

## 操作

1. 利用者が商品ページを開く。
2. 必要なら商品名や説明の一部を選択する。
3. ツールバーのP-GATEアイコンを押す。
4. サイドパネルが現在ページのタイトル、または選択文字を最大200文字で表示する。
5. 利用者が内容を編集し、送信への同意を選ぶ。
6. P-GATE PWAが開き、相談欄へ文字が入る。
7. Turnstileと同意後、既存の多言語Knowledgeで検索する。

## 権限

| 権限 | 使用目的 |
|---|---|
| `activeTab` | アイコンを押した現在タブだけを一時的に対象とする |
| `scripting` | 現在タブのタイトルと選択文字だけを取得する |
| `sidePanel` | 利用者が送信前に内容を確認する |
| `storage` | 管理者が指定したPWAのHTTPS URLを保存する |

`host_permissions`は使用しない。閲覧履歴、Cookie、ページ本文全体、フォーム入力、アカウント情報は取得しない。

## プライバシー

- ページから読み取った文字はサイドパネル内で利用者へ表示する。
- 同意前はP-GATEへ渡さない。
- 質問はURLのクエリではなく`#q=...`フラグメントへ入れる。
- URLフラグメントはHTTPリクエストへ含まれないため、静的配信サーバーのURLログへ質問を送らない。
- PWAは読み取り直後にブラウザ履歴からフラグメントを削除する。
- 外部JavaScript、広告SDK、解析SDKを拡張へ組み込まない。

## Manifest V3

- `manifest_version=3`
- Service Workerはローカルファイルのみ
- Side Panel APIを使用するためChrome 114以降
- Chrome Web Store公開前に権限説明、プライバシー方針、アイコン、画面画像を準備する

## 初版の制限

- 回答はPWAタブで表示する。
- 拡張内で直接回答するには、Turnstileに代わる端末認証・契約認証が必要。
- 商品ページのDOM構造へ依存する自動スクレイピングは行わない。
- セラー管理画面の自動操作は行わない。

## 将来

PWAの継続利用とChrome経由の送客が確認できた場合だけ、端末ペアリング、拡張内回答、比較表、複数EC横断候補を追加する。

## 公式仕様

- [Chrome Extensions / Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Chrome Extension manifest](https://developer.chrome.com/docs/extensions/reference/manifest)
