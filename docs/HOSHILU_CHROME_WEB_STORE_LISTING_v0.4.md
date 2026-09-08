# HOSHILU Chrome Web Store listing v0.4

Status: code and copy ready / support contact and screenshots pending

## Name

- Japanese: ホシル｜見ている商品を相談
- English: HOSHILU — Find products from clues
- Chinese: HOSHILU — 根据线索查找商品
- Korean: HOSHILU — 단서로 상품 찾기

## Short description

表示中のページタイトルまたは選択した文字を、利用者の確認と同意後にHOSHILUへ渡し、
商品名が分からないものを相談できます。

## Detailed description

HOSHILUは、見た目、見た場所、使い方などの曖昧な手がかりから商品を探すサービスです。
この拡張機能は、利用者がアイコンを押した現在のタブについて、ページタイトルまたは
利用者自身が選択した文字だけをサイドパネルへ読み取ります。

相談内容は送信前に編集でき、明示的な同意後にHOSHILUを新しいタブで開きます。
閲覧履歴、Cookie、入力フォーム、ページ本文全体は取得しません。

## Permission justifications

| Permission | Purpose |
|---|---|
| `activeTab` | 利用者が拡張を開いた現在のタブだけへ一時的にアクセスする |
| `scripting` | 現在のページタイトルと選択文字を読み取る |
| `sidePanel` | 相談内容の確認・編集・同意画面を表示する |
| `storage` | HOSHILUの公開HTTPS接続先だけを同期保存する |

ホスト権限、閲覧履歴権限、Cookie権限、タブ全体を常時監視する権限は要求しません。

## Data disclosure

- Collected from the active page: page title or user-selected text
- Transfer timing: only after the user checks consent and presses the consultation button
- Transfer destination: the configured HTTPS HOSHILU origin
- Transport: the text is placed in a URL fragment so it is not included in ordinary HTTP request logs
- Sold or used for advertising profiles: no
- Authentication data, financial data, health data, location, browsing history: not collected

## URLs

- Homepage: `https://hoshilu.app/`
- Privacy: `https://hoshilu.app/privacy.html`
- Terms: `https://hoshilu.app/terms.html`
- Support: pending formal operator contact

## Required screenshots

1. Side panel showing extracted page title before consent
2. Side panel showing selected text and checked consent
3. HOSHILU result page opened from the extension
4. Connection settings page with `https://hoshilu.app`

Do not include real customer information, account identifiers, browser bookmarks, emails, or private tabs.
