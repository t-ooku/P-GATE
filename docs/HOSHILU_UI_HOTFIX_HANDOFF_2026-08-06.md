# HOSHILU 緊急UI修正 引継ぎ指示書

更新日: 2026-08-06
対象: 横断検索リンクボタン復旧・青文字リンク削除・セクション並び替えを引き継ぐClaudeセッション
このドキュメントを読んだら、まず本番URL(`https://hoshilu.app`)を実際にブラウザで開いて現状を目で確認してから着手すること。ソースコードを読むだけで判断しない。

## 0. 本指示の位置づけ

これは新機能実装ではない。既存バグ修正とセクション並び替えのみ。`docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md`（GAS→Web移行）とは**別作業**であり、優先度はこちらが上（緊急）。両方を同じブランチ・同じセッションで同時に進めない（§5参照）。

## 1. これまでの経緯（このリポジトリのgit履歴で確認済み）

対象ファイル: `tools/line-worker/public/app.js`, `tools/line-worker/public/index.html`

| コミット | 内容 |
|---|---|
| `499974e` "ui: remove mall-name fallback links and official social account section" | 「不要なクラター」としてモール名リンク一覧とofficial social linksをUIから削除 |
| `406f7d6` "ui: restore mall-name fallback links and official social account section"（直近） | 499974eを取り消して復元。コミットメッセージの主張: 「削除前に青文字で見えていたのは、CSS/JSパイプラインを通さないfile://直接プレビューで見ていたからで、本番では`ai-search-ui.css`の`[data-marketplace]`ルールにより色付きボタンとして表示される」 |

**この`406f7d6`の診断が正しいかどうかを、今回のセッションで最優先に再確認すること。** ユーザーが提示した今回のスクリーンショットは、まさに「Amazon / 楽天市場 / Yahoo! / Qoo10 / SHEIN / ZOZOTOWN / SHOPLIST / MUSINSA / BUYMA / SNKRDUNK」と「LINE公式 / Instagram公式 / X公式」が青文字下線付きリンクとして縦に並んでいる状態を示しており、`406f7d6`が「本番では正しく表示される」と主張した直後の状態と矛盾する可能性がある。

確認手順:
1. 本番の`https://hoshilu.app`を実際のブラウザで開く（file://直接プレビューではなく）
2. 検索を実行し、結果表示・no-results fallback・ホームページ下部の`marketplaceCoverage`/`officialSocial`セクションそれぞれで、青文字リンクが出ていないか確認する
3. 出ている場合、それが`marketplaceCoverage`(`index.html:160-184`)・`officialSocial`(`index.html:186-197`)の静的セクションなのか、それとも`app.js`が動的生成する検索結果カード内のfallback UIなのかを、実際のDOM(devtools)で特定する
4. `ai-search-ui.css`の`[data-marketplace]`セレクタが、実際にレンダリングされた要素の属性と一致しているか確認する（JSが`data-marketplace`属性を付け忘れている、または該当CSSファイルの読み込み漏れ・キャッシュ古さの可能性がある）

## 2. セクション並び替えの現状（未完了）

`tools/line-worker/public/index.html`の現在のセクション出現順（行番号は2026-08-06時点）:

```
137  hoshiluSearch          (ホシル検索フォーム)
153  resultsSection         (MATCHES / 検索結果)
160  marketplaceCoverage    ← MARKETPLACE COVERAGE
186  officialSocial         ← HOSHILU OFFICIAL
202  announcements          (HOSHILU NEWS)          ★挟まっている
213  sale-center            (HOSHILU SALE RADAR)    ★挟まっている
236  lp-benefits            (WHY HOSHILU)           ★挟まっている
241  search-journey         ← HOSHILU SEARCH AGENT
255  insight                (HOSHILU INSIGHT)       ★挟まっている
270  discovery-collage      ← HOSHILU DISCOVERY
```

要求される最終順序（間に他セクションを挟まない）:

```
MARKETPLACE COVERAGE
HOSHILU OFFICIAL
HOSHILU SEARCH AGENT
HOSHILU DISCOVERY
```

現状は`MARKETPLACE COVERAGE`→`HOSHILU OFFICIAL`の直後に`HOSHILU NEWS`・`HOSHILU SALE RADAR`・`WHY HOSHILU`が割り込み、さらに`HOSHILU SEARCH AGENT`→`HOSHILU DISCOVERY`の間に`HOSHILU INSIGHT`が割り込んでいる。**この4セクションを`index.html`内で連続したブロックとして並べ替える必要がある。** `HOSHILU NEWS`・`HOSHILU SALE RADAR`・`WHY HOSHILU`・`HOSHILU INSIGHT`をどこに移すかは指示にないため、この4セクションブロックの前か後ろにまとめて配置する（内容・機能は変更しない、位置のみ）。

`lp-layout.mjs`がJSで実行時にDOM順を並び替えていないかも確認すること（`index.html`のソース順と画面表示順が一致するとは限らない）。

## 3. 元指示（HOSHILU 緊急UI修正 SSoT）— 全文

以下がユーザーから与えられた完全な指示。要約せず全項目を満たすこと。

### 目的
現在のHOSHILU画面で発生している以下を修正する。
1. モール・SNSへの横断検索リンクボタンが消えている
2. 不要な青文字リンクが露出している
3. 下部セクションの表示順が誤っている

### ① モール・SNSのリンクボタンを復帰
検索結果画面に、以前存在していたカラーボタン形式の横断検索リンクを復帰する。削除禁止の既存機能。

**モールで探す**（10モール必須表示）: Amazon / 楽天市場 / Yahoo!ショッピング / Qoo10 / SHEIN / ZOZOTOWN / SHOPLIST / MUSINSA / BUYMA / SNKRDUNK

**SNSで探す・共有**（必須表示）: Instagram / X / TikTok / YouTube / LINEで共有

**リンクボタンの動作**: 各ボタンは各サービスのトップページへ移動するのではなく、現在の検索内容をHOSHILUが各サービス向け検索語へ変換し、その検索語を含む検索結果ページへ遷移させる。

```
ユーザーの検索文 → HOSHILUで正規化・検索語変換 → 各モール・SNS向け検索語を生成 → URLエンコード → 各サービスの検索結果ページへ遷移
```

既存のURL生成処理・検索語変換処理があれば復旧・再利用する。トップページだけに遷移させる実装は禁止。

**正式UI**: モールごとの色を使ったボタン／SNSごとの色を使ったボタン／スマートフォンで2列を基本／PCでは画面幅に応じた複数列／文字切れなし／ボタン重なりなし／横スクロールなし／タップ領域44px以上。

AI最安比較（表示された1つの商品を各モールで比較する機能）とは別機能。今回、AI最安比較の新規実装は行わない。

### ② 添付画像の青文字リンクを削除
現在画面に表示されている、Amazon〜SNKRDUNK、LINE公式〜X公式の青文字箇条書きリンクは正式UIではない。ユーザー画面から完全に削除する。**CSSで見えなくするだけの対応は禁止。** 以下のどれが原因かを確認し、根本修正する:

- 古いHTMLが残っている
- フォールバック要素が通常表示されている
- モバイル用テンプレートだけ古い
- JavaScript描画失敗
- hydration失敗
- `noscript`要素の誤表示
- メディアクエリによるボタン非表示
- DOMの二重生成
- 古いキャッシュ用マークアップ
- リンクボタンの代わりに旧テキストリンクを出力している

青文字リンクを削除しても、①のカラーボタンは必ず残す。

### ③④⑤ セクション移動
- `HOSHILU SEARCH AGENT`を`HOSHILU DISCOVERY`の直前・上段へ
- `HOSHILU OFFICIAL`を`HOSHILU SEARCH AGENT`の直前・上段へ
- `MARKETPLACE COVERAGE`を`HOSHILU OFFICIAL`の直前・上段へ

最終順序:
```
MARKETPLACE COVERAGE
HOSHILU OFFICIAL
HOSHILU SEARCH AGENT
HOSHILU DISCOVERY
```
この4セクションの間へ別セクションを挟まない。各セクション内部の内容・名称・機能は変更しない。配置順のみ変更。

### 作業対象外（今回実装しない）
AIあいまい検索の刷新／関連キーワード5件以上の表示／検索条件チップ／×ボタンによる条件削除／詳細条件検索／30件表示／AI最安比較の新規実装／AIウォッチの新機能追加／新しいTeacher Dataset／Business機能／デザイン全面刷新。現在進行中のバグ修正ブランチへ、大規模な検索仕様変更を混ぜない。

### 回帰テスト（最低限）
横断リンク: 10モールのカラーボタンが存在する／SNS5ボタンが存在する／各リンクに検索語が含まれる／トップページだけへ遷移しない／日本語検索語が壊れない／PCとスマートフォンの両方で表示される／ボタンが重ならない／青文字リンクが表示されない。

並び順: DOM上および画面上で`MARKETPLACE COVERAGE → HOSHILU OFFICIAL → HOSHILU SEARCH AGENT → HOSHILU DISCOVERY`の順になっていること。

既存機能: 商品検索が動く／商品カードが表示される／AIチャットを壊していない／AIウォッチを壊していない／SALE RADARを壊していない／PC表示を壊していない／スマートフォン表示を壊していない。

### 完了条件
モール10個のカラーボタンが復帰／SNS5個のカラーボタンが復帰／各ボタンが検索語付きリンクとして動作／添付画像の青文字リンクが完全に消える／`MARKETPLACE COVERAGE`が最上段／その下に`HOSHILU OFFICIAL`／その下に`HOSHILU SEARCH AGENT`／その下に`HOSHILU DISCOVERY`／PC表示正常／スマートフォン表示正常／全テストPASS／GitHubへpush／Cloudflare本番デプロイ／本番画面で確認。

### 最終報告項目
青文字リンクが表示された根本原因／横断検索ボタンが消えた根本原因／修正したファイル／モール別リンク生成方法／SNS別リンク生成方法／セクション並び替え箇所／最終DOM順／PC確認結果／スマートフォン確認結果／テスト結果／GitHubコミットID／Cloudflare Version ID／未完了事項。

### 作業ルール
今回の5項目だけを実施／途中確認不要／GitHub保存から本番デプロイまで実施／青文字をCSSで隠すだけの対応は禁止／カラーボタンを削除・統合・テキスト化しない／セクション名や内部機能を変更しない／新しい検索体験仕様を混ぜない／重大障害、データ破損、認証情報漏洩の危険がある場合のみ停止。

本指示を「HOSHILU 緊急UI修正 SSoT」として扱い、現在のバグ修正作業の中で完了させる。

## 4. 関連ファイルの手がかり

- `tools/line-worker/public/index.html` — 静的セクション構造（marketplaceCoverage, officialSocial, search-journey, discovery-collage）
- `tools/line-worker/public/app.js` — 検索結果カード・no-results fallbackの動的生成ロジック（406f7d6/499974eが変更した箇所）
- `tools/line-worker/public/ai-search-ui.mjs` / `ai-search-ui.css` — `[data-marketplace]`色分けルール、AI検索カードUI
- `tools/line-worker/public/marketplace-coverage.mjs` / `.css` — MARKETPLACE COVERAGEセクションの挙動
- `tools/line-worker/public/lp-layout.mjs` — ページレイアウト制御（実行時にDOM順を変えていないか要確認）
- `tools/line-worker/src/rakuten-url-policy.mjs` / `marketplace-product-url-policy.mjs` / `index.mjs`内の`signedMarketplaceSearchLinks()` — 既存の署名付きモール検索リンク生成ロジック（横断検索ボタンのURL生成はこれを再利用できないか確認する）
- `tools/line-worker/test/discovery-collage.test.mjs` — 406f7d6が復元したテスト。ここに現状のmarkup期待値がロックされているので、①②の修正後は内容も合わせて更新する

## 5. ブランチについて

現在`feature/ui-search-v2`ブランチでは、別セッションがGAS→Web移行（ContractPolicyEngine移植など、`docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md`）を並行して進めている可能性がある。同じブランチに両方が同時にpushすると衝突するため、本UI修正は`hotfix/ui-mall-links-order-2026-08-06`ブランチ（`feature/ui-search-v2`から分岐済み、このドキュメントを含む）で作業し、完了後に`feature/ui-search-v2`へマージすること。
